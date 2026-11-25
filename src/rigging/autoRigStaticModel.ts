import * as THREE from 'three';

export interface StaticBipedLandmarks {
  height: number;
  pelvisY: number;
  spineY: number;
  chestY: number;
  neckY: number;
  headCenterY: number;
  chinY: number;
  mouthY: number;
  mouthZ: number;
  noseY: number;
  noseZ: number;
  eyeY: number;
  eyeX: number;
  eyeZ: number;
  browY: number;
  faceCenterX: number;
  faceMaxZ: number; // excludes overhanging hat brim / glasses front
  earX: number;
  earY: number;
  leftLegX: number;
  rightLegX: number;
  kneeY: number;
  ankleY: number;
  leftShoulder: THREE.Vector3;
  leftElbow: THREE.Vector3;
  leftWrist: THREE.Vector3;
  leftPalmEnd: THREE.Vector3;
  rightShoulder: THREE.Vector3;
  rightElbow: THREE.Vector3;
  rightWrist: THREE.Vector3;
  rightPalmEnd: THREE.Vector3;
  handSpanZ: number;
}

/**
 * Analyzes a normalized (y in [0, height], centered in X/Z, facing +Z) biped mesh
 * to locate exact joint centers for neck, torso, pelvis, legs, A-pose/T-pose arms,
 * fingers, and facial features.
 */
export function analyzeStaticBipedLandmarks(geom: THREE.BufferGeometry): StaticBipedLandmarks {
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const H = Math.max(0.5, box.max.y);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const count = pos.count;

  // Stride for ultra-fast landmark detection (~25k samples) while remaining deterministic
  const stride = Math.max(1, Math.floor(count / 26000));

  // 1. Scan torso/neck profile along center |x| < 0.065 to locate the Neck pinch
  const ySteps = 44;
  const yStart = H * 0.56;
  const yEnd = H * 0.84;
  let neckY = H * 0.72;
  let minDepth = Infinity;

  for (let s = 0; s < ySteps; s++) {
    const y0 = yStart + ((yEnd - yStart) * s) / ySteps;
    const y1 = y0 + (yEnd - yStart) / ySteps;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let n = 0;
    for (let i = 0; i < count; i += stride) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      if (Math.abs(vx) < 0.075 && vy >= y0 && vy < y1) {
        const vz = pos.getZ(i);
        if (vz < minZ) minZ = vz;
        if (vz > maxZ) maxZ = vz;
        n++;
      }
    }
    if (n >= 5) {
      const depth = maxZ - minZ;
      if (depth < minDepth) {
        minDepth = depth;
        neckY = (y0 + y1) * 0.5;
      }
    }
  }

  // 2. Scan legs vs pelvis split (where |x| < 0.025 center stops having vertices)
  let crotchY = H * 0.45;
  for (let y = H * 0.62; y >= H * 0.28; y -= 0.025) {
    let centerCount = 0;
    for (let i = 0; i < count; i += stride) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      if (Math.abs(vx) < 0.028 && Math.abs(vy - y) < 0.015) {
        centerCount++;
      }
    }
    if (centerCount < 3) {
      crotchY = y + 0.025;
      break;
    }
  }
  const pelvisY = Math.min(neckY - 0.24, crotchY + 0.07);
  const chestY = THREE.MathUtils.lerp(pelvisY, neckY, 0.74);
  const spineY = THREE.MathUtils.lerp(pelvisY, neckY, 0.36);

  // 3. Measure leg X centers
  let lxSum = 0;
  let ln = 0;
  let rxSum = 0;
  let rn = 0;
  for (let i = 0; i < count; i += stride) {
    const vy = pos.getY(i);
    if (vy > H * 0.08 && vy < pelvisY - 0.06) {
      const vx = pos.getX(i);
      if (vx > 0.02) {
        lxSum += vx;
        ln++;
      } else if (vx < -0.02) {
        rxSum += vx;
        rn++;
      }
    }
  }
  const leftLegX = ln > 10 ? lxSum / ln : 0.13;
  const rightLegX = rn > 10 ? rxSum / rn : -0.13;
  const kneeY = pelvisY * 0.52;
  const ankleY = H * 0.05;

  // 4. Measure Arm A-pose / T-pose centerline below neckY
  const sampleArmBin = (side: 1 | -1, xMin: number, xMax: number): [number, number] | null => {
    let sy = 0;
    let sz = 0;
    let sn = 0;
    for (let i = 0; i < count; i += stride) {
      const vx = pos.getX(i) * side;
      const vy = pos.getY(i);
      if (vy > pelvisY * 0.85 && vy < neckY - 0.015 && vx >= xMin && vx < xMax) {
        sy += vy;
        sz += pos.getZ(i);
        sn++;
      }
    }
    return sn >= 3 ? [sy / sn, sz / sn] : null;
  };

  let maxArmX = 0.58;
  let minArmX = -0.58;
  let handZMin = Infinity;
  let handZMax = -Infinity;
  for (let i = 0; i < count; i += stride) {
    const vy = pos.getY(i);
    if (vy > pelvisY * 0.85 && vy < neckY - 0.01) {
      const vx = pos.getX(i);
      if (vx > maxArmX) maxArmX = vx;
      if (vx < minArmX) minArmX = vx;
      if (Math.abs(vx) > 0.48) {
        const vz = pos.getZ(i);
        if (vz < handZMin) handZMin = vz;
        if (vz > handZMax) handZMax = vz;
      }
    }
  }

  const buildArmChain = (side: 1 | -1, tipAbsX: number) => {
    const shX = Math.min(0.195, tipAbsX * 0.28);
    const armRootX = Math.min(0.26, tipAbsX * 0.37);
    const elX = Math.min(0.4, tipAbsX * 0.56);
    const wrX = Math.min(0.56, tipAbsX * 0.82);

    // Sample outside torso/backpack (|x| ~ armRootX) so backpack rear vertices don't pull shoulder backward
    const rootSample = sampleArmBin(side, armRootX - 0.03, armRootX + 0.03);
    const elSample = sampleArmBin(side, elX - 0.035, elX + 0.035);
    const wrSample = sampleArmBin(side, wrX - 0.035, wrX + 0.035);

    const elbowY = elSample ? elSample[0] : neckY - 0.14;
    const elbowZ = elSample ? elSample[1] : 0.02;
    const rootY = rootSample ? rootSample[0] : elbowY + 0.02;
    const rootZ = rootSample ? rootSample[1] : 0.0;
    const shoulderY = THREE.MathUtils.lerp(rootY, neckY - 0.1, 0.35);
    const shoulderZ = rootZ * 0.5;
    const wristY = wrSample ? wrSample[0] : elbowY + 0.03;
    const wristZ = wrSample ? wrSample[1] : elbowZ + 0.07;

    const palmEndX = Math.max(wrX + 0.055, tipAbsX - 0.045);

    return {
      shoulder: new THREE.Vector3(side * shX, shoulderY, shoulderZ),
      elbow: new THREE.Vector3(side * elX, elbowY, elbowZ),
      wrist: new THREE.Vector3(side * wrX, wristY, wristZ),
      palmEnd: new THREE.Vector3(side * palmEndX, wristY, wristZ + 0.02),
    };
  };

  const leftArm = buildArmChain(1, maxArmX);
  const rightArm = buildArmChain(-1, Math.abs(minArmX));
  const handSpanZ = Number.isFinite(handZMax - handZMin)
    ? THREE.MathUtils.clamp(handZMax - handZMin, 0.05, 0.14)
    : 0.075;

  // 5. Locate Face Center X & Face Landmarks above neckY (Chin -> Mouth -> Nose -> Eyes -> Brows)
  let faceXSum = 0;
  let faceXN = 0;
  for (let i = 0; i < count; i += stride) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    if (vy >= neckY + 0.03 && vy <= neckY + 0.22 && vz > 0.11 && Math.abs(vx) < 0.085) {
      faceXSum += vx;
      faceXN++;
    }
  }
  const faceCenterX = faceXN > 20 ? faceXSum / faceXN : 0;

  let chinY = neckY + 0.04;
  let prevFrontZ = 0.06;
  for (let y = neckY; y <= Math.min(H - 0.12, neckY + 0.18); y += 0.015) {
    let frontZ = -Infinity;
    for (let i = 0; i < count; i += stride) {
      const vx = pos.getX(i) - faceCenterX;
      const vy = pos.getY(i);
      if (Math.abs(vx) < 0.028 && vy >= y && vy < y + 0.016) {
        const vz = pos.getZ(i);
        if (vz > frontZ) frontZ = vz;
      }
    }
    if (frontZ > -Infinity && frontZ - prevFrontZ > 0.045 && y > neckY + 0.015) {
      chinY = y;
      break;
    }
    if (frontZ > -Infinity) prevFrontZ = frontZ;
  }

  // Find Nose tip (highest Z in lower-mid face [chinY + 0.04 .. chinY + 0.115], below glasses/hat)
  let noseY = chinY + 0.088;
  let noseZ = 0.175;
  let bestNoseZ = -Infinity;
  for (let i = 0; i < count; i += stride) {
    const vx = pos.getX(i) - faceCenterX;
    const vy = pos.getY(i);
    if (Math.abs(vx) < 0.024 && vy >= chinY + 0.04 && vy <= chinY + 0.115) {
      const vz = pos.getZ(i);
      if (vz > bestNoseZ) {
        bestNoseZ = vz;
        noseY = vy;
        noseZ = vz;
      }
    }
  }

  const mouthY = THREE.MathUtils.lerp(chinY, noseY, 0.48);
  let mouthZ = noseZ - 0.02;
  let bestMouthZ = -Infinity;
  for (let i = 0; i < count; i += stride) {
    const vx = pos.getX(i) - faceCenterX;
    const vy = pos.getY(i);
    if (Math.abs(vx) < 0.032 && Math.abs(vy - mouthY) < 0.014) {
      const vz = pos.getZ(i);
      if (vz > bestMouthZ) bestMouthZ = vz;
    }
  }
  if (bestMouthZ > 0.05) mouthZ = bestMouthZ;

  const eyeY = noseY + 0.045;
  const eyeX = 0.056;
  const eyeZ = mouthZ - 0.006;
  const browY = eyeY + 0.045;
  const faceMaxZ = noseZ + 0.018; // Excludes hat brim overhanging at > 0.215

  const headCenterY = neckY + 0.16;
  const earX = 0.145;
  const earY = noseY;

  return {
    height: H,
    pelvisY,
    spineY,
    chestY,
    neckY,
    headCenterY,
    chinY,
    mouthY,
    mouthZ,
    noseY,
    noseZ,
    eyeY,
    eyeX,
    eyeZ,
    browY,
    faceCenterX,
    faceMaxZ,
    earX,
    earY,
    leftLegX,
    rightLegX,
    kneeY,
    ankleY,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    leftWrist: leftArm.wrist,
    leftPalmEnd: leftArm.palmEnd,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    rightWrist: rightArm.wrist,
    rightPalmEnd: rightArm.palmEnd,
    handSpanZ,
  };
}

export type ArmRestBasis = Record<
  string,
  {
    pre: THREE.Quaternion;
    post: THREE.Quaternion;
  }
>;

/**
 * Builds an expressive full-face + 10-finger biped skeleton fitted to the analyzed mesh landmarks,
 * plus stores rest-arm pre/post quaternion basis so canonical T-pose animations & gestures
 * (wave_greet, hand_on_chin, idle, walk, etc.) align naturally with A-pose meshes!
 */
export function buildFittedBipedSkeleton(lm: StaticBipedLandmarks): {
  root: THREE.Bone;
  bones: THREE.Bone[];
  armRestBasis: ArmRestBasis;
} {
  const pelvis = new THREE.Bone();
  pelvis.name = 'Pelvis';
  pelvis.position.set(0, lm.pelvisY, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, lm.spineY - lm.pelvisY, 0);
  pelvis.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, lm.chestY - lm.spineY, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, lm.neckY - lm.chestY, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, lm.headCenterY - lm.neckY, 0.01);
  neck.add(head);

  // Expressive Face Bones
  const jaw = new THREE.Bone();
  jaw.name = 'Jaw';
  jaw.position.set(0, lm.chinY - lm.headCenterY, 0.035);
  head.add(jaw);

  const leftEye = new THREE.Bone();
  leftEye.name = 'LeftEye';
  leftEye.position.set(lm.eyeX, lm.eyeY - lm.headCenterY, lm.eyeZ - 0.04);
  head.add(leftEye);

  const rightEye = new THREE.Bone();
  rightEye.name = 'RightEye';
  rightEye.position.set(-lm.eyeX, lm.eyeY - lm.headCenterY, lm.eyeZ - 0.04);
  head.add(rightEye);

  const leftEyelid = new THREE.Bone();
  leftEyelid.name = 'LeftEyelid';
  leftEyelid.position.set(lm.eyeX, lm.eyeY + 0.016 - lm.headCenterY, lm.eyeZ - 0.01);
  head.add(leftEyelid);

  const rightEyelid = new THREE.Bone();
  rightEyelid.name = 'RightEyelid';
  rightEyelid.position.set(-lm.eyeX, lm.eyeY + 0.016 - lm.headCenterY, lm.eyeZ - 0.01);
  head.add(rightEyelid);

  const leftBrow = new THREE.Bone();
  leftBrow.name = 'LeftBrow';
  leftBrow.position.set(lm.eyeX, lm.browY - lm.headCenterY, lm.eyeZ - 0.01);
  head.add(leftBrow);

  const rightBrow = new THREE.Bone();
  rightBrow.name = 'RightBrow';
  rightBrow.position.set(-lm.eyeX, lm.browY - lm.headCenterY, lm.eyeZ - 0.01);
  head.add(rightBrow);

  const nose = new THREE.Bone();
  nose.name = 'Nose';
  nose.position.set(0, lm.noseY - lm.headCenterY, lm.noseZ - 0.02);
  head.add(nose);

  const leftEar = new THREE.Bone();
  leftEar.name = 'LeftEar';
  leftEar.position.set(lm.earX, lm.earY - lm.headCenterY, 0);
  head.add(leftEar);

  const rightEar = new THREE.Bone();
  rightEar.name = 'RightEar';
  rightEar.position.set(-lm.earX, lm.earY - lm.headCenterY, 0);
  head.add(rightEar);

  const armRestBasis: ArmRestBasis = {};

  // Helper to attach Arm + Hand + 5 Articulated Fingers on a side
  const addArmSide = (
    sideName: 'Left' | 'Right',
    sign: 1 | -1,
    shoulderWorld: THREE.Vector3,
    elbowWorld: THREE.Vector3,
    wristWorld: THREE.Vector3,
    palmEndWorld: THREE.Vector3,
  ) => {
    const clavWorld = new THREE.Vector3(sign * 0.09, shoulderWorld.y + 0.02, 0);
    const shoulder = new THREE.Bone();
    shoulder.name = `${sideName}Shoulder`;
    shoulder.position.set(clavWorld.x, clavWorld.y - lm.chestY, clavWorld.z);
    chest.add(shoulder);

    const upperArm = new THREE.Bone();
    upperArm.name = `${sideName}UpperArm`;
    upperArm.position.copy(shoulderWorld).sub(clavWorld);
    shoulder.add(upperArm);

    const forearm = new THREE.Bone();
    forearm.name = `${sideName}Forearm`;
    forearm.position.copy(elbowWorld).sub(shoulderWorld);
    upperArm.add(forearm);

    const hand = new THREE.Bone();
    hand.name = `${sideName}Hand`;
    hand.position.copy(wristWorld).sub(elbowWorld);
    forearm.add(hand);

    // Record T-pose <-> A-pose rest-angle compensation for UpperArm, Forearm & Hand:
    // qApply = pre * qTpose * post
    const canonAxis = new THREE.Vector3(sign, 0, 0);
    const upperDir = elbowWorld.clone().sub(shoulderWorld).normalize();
    const foreDir = wristWorld.clone().sub(elbowWorld).normalize();
    const handVec = palmEndWorld.clone().sub(wristWorld);
    const handDir = handVec.lengthSq() > 1e-6 ? handVec.clone().normalize() : foreDir.clone();

    const qRestUpper = new THREE.Quaternion().setFromUnitVectors(canonAxis, upperDir);
    const qRestFore = new THREE.Quaternion().setFromUnitVectors(canonAxis, foreDir);
    const qRestHand = new THREE.Quaternion().setFromUnitVectors(canonAxis, handDir);

    armRestBasis[`${sideName}UpperArm`] = {
      pre: new THREE.Quaternion(),
      post: qRestUpper.clone().invert(),
    };
    armRestBasis[`${sideName}Forearm`] = {
      pre: qRestUpper.clone(),
      post: qRestFore.clone().invert(),
    };
    armRestBasis[`${sideName}Hand`] = {
      pre: qRestFore.clone(),
      post: qRestHand.clone().invert(),
    };

    const palmLen = Math.max(0.04, handVec.length());
    const zHalf = lm.handSpanZ * 0.45;
    const fingerSpecs = [
      { key: 'Thumb', z: zHalf * 1.15, xFrac: 0.45, l1: 0.024, l2: 0.02 },
      { key: 'Index', z: zHalf * 0.72, xFrac: 1.0, l1: 0.028, l2: 0.022 },
      { key: 'Middle', z: zHalf * 0.2, xFrac: 1.05, l1: 0.03, l2: 0.024 },
      { key: 'Ring', z: -zHalf * 0.3, xFrac: 1.0, l1: 0.027, l2: 0.021 },
      { key: 'Pinky', z: -zHalf * 0.8, xFrac: 0.9, l1: 0.022, l2: 0.018 },
    ];
    for (const f of fingerSpecs) {
      const f1 = new THREE.Bone();
      f1.name = `${sideName}${f.key}1`;
      f1.position.set(
        sign * palmLen * f.xFrac,
        handVec.y * f.xFrac * 0.5,
        handVec.z * f.xFrac + f.z,
      );
      hand.add(f1);

      const f2 = new THREE.Bone();
      f2.name = `${sideName}${f.key}2`;
      f2.position.set(sign * f.l1, 0, 0);
      f1.add(f2);
    }
  };

  addArmSide(
    'Left',
    1,
    lm.leftShoulder,
    lm.leftElbow,
    lm.leftWrist,
    lm.leftPalmEnd,
  );
  addArmSide(
    'Right',
    -1,
    lm.rightShoulder,
    lm.rightElbow,
    lm.rightWrist,
    lm.rightPalmEnd,
  );

  // Legs
  const addLegSide = (sideName: 'Left' | 'Right', legX: number) => {
    const thigh = new THREE.Bone();
    thigh.name = `${sideName}Thigh`;
    thigh.position.set(legX * 0.85, -0.05, 0);
    pelvis.add(thigh);

    const shin = new THREE.Bone();
    shin.name = `${sideName}Shin`;
    shin.position.set(legX * 0.15, lm.kneeY - (lm.pelvisY - 0.05), 0);
    thigh.add(shin);

    const foot = new THREE.Bone();
    foot.name = `${sideName}Foot`;
    foot.position.set(0, lm.ankleY - lm.kneeY, 0.02);
    shin.add(foot);
  };

  addLegSide('Left', lm.leftLegX);
  addLegSide('Right', lm.rightLegX);

  const bones: THREE.Bone[] = [];
  pelvis.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) bones.push(obj as THREE.Bone);
  });

  return { root: pelvis, bones, armRestBasis };
}

/**
 * Synthesizes 12 smooth Morph Target Blendshapes directly onto a static unrigged biped mesh
 * (jawOpen, viseme_aa, viseme_O, viseme_E, viseme_PP, mouthSmile, browInnerUp, browDown,
 * eyeBlinkLeft, eyeBlinkRight, noseSneer, earPerk) so Gemini speech & lipsync animate the real 3D face.
 */
export function attachFittedFaceMorphTargets(
  geom: THREE.BufferGeometry,
  lm: StaticBipedLandmarks,
): string[] {
  // Skip if geometry already has authored morph targets
  if (geom.morphAttributes.position && geom.morphAttributes.position.length > 0) {
    return (geom.userData.morphTargetNames as string[]) ?? [];
  }

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
    'mouthFrown',
    'cheekSquint',
    'viseme_FV',
    'viseme_TH',
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
  const iJaw = idxOf('jawOpen');
  const iAa = idxOf('viseme_aa');
  const iO = idxOf('viseme_O');
  const iE = idxOf('viseme_E');
  const iPP = idxOf('viseme_PP');
  const iSmile = idxOf('mouthSmile');
  const iBrowUp = idxOf('browInnerUp');
  const iBrowDn = idxOf('browDown');
  const iBlinkL = idxOf('eyeBlinkLeft');
  const iBlinkR = idxOf('eyeBlinkRight');
  const iNose = idxOf('noseSneer');
  const iEar = idxOf('earPerk');
  const iFrown = idxOf('mouthFrown');
  const iCheek = idxOf('cheekSquint');
  const iFV = idxOf('viseme_FV');
  const iTH = idxOf('viseme_TH');

  const gauss = (dSq: number, sigmaSq: number) => Math.exp(-dSq / sigmaSq);

  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < lm.neckY + 0.01) continue;

    const x = pos.getX(i);
    const relX = x - lm.faceCenterX;
    const z = pos.getZ(i);

    // Restrict face deformations behind overhanging hat brim (z <= faceMaxZ)
    if (z > lm.faceMaxZ) continue;

    // 1. Mouth & Jaw region (centered at [faceCenterX, mouthY, mouthZ])
    if (
      y > lm.chinY + 0.008 &&
      y < lm.noseY - 0.006 &&
      z > lm.mouthZ - 0.08 &&
      Math.abs(relX) < 0.075
    ) {
      const dx = relX / 0.048;
      const dyMouth = (y - lm.mouthY) / 0.022;
      const dzMouth = (z - lm.mouthZ) / 0.05;
      const wMouth = gauss(dx * dx + dyMouth * dyMouth + dzMouth * dzMouth, 0.9);

      if (wMouth > 0.02) {
        const chinGuard = THREE.MathUtils.clamp((y - (lm.chinY + 0.012)) / 0.024, 0, 1);
        const isLower = y <= lm.mouthY + 0.002;
        const lowerW = isLower
          ? wMouth * chinGuard
          : wMouth * Math.max(0, 1 - (y - (lm.mouthY + 0.002)) / 0.012);
        const upperW = !isLower ? wMouth * 0.6 : 0;
        const cornerW = wMouth * Math.min(1, Math.abs(relX) / 0.016);

        // jawOpen: crisp gentle opening + subtle inner-lip recess & slight corner widening
        targets[iJaw][i * 3] = lm.faceCenterX + relX * (1 + cornerW * 0.14);
        targets[iJaw][i * 3 + 1] = y - lowerW * 0.015 + upperW * 0.003;
        targets[iJaw][i * 3 + 2] = z - lowerW * 0.008;

        // viseme_aa: open vowel with balanced width & gentle vertical drop
        targets[iAa][i * 3] = lm.faceCenterX + relX * (1 + cornerW * 0.18);
        targets[iAa][i * 3 + 1] = y - lowerW * 0.014 + upperW * 0.004;
        targets[iAa][i * 3 + 2] = z - lowerW * 0.005;

        // viseme_O: pulls left & right sides cleanly inward toward center + forward lip round
        targets[iO][i * 3] = lm.faceCenterX + relX * (1 - wMouth * 0.36);
        targets[iO][i * 3 + 1] = y - lowerW * 0.009 + upperW * 0.004;
        targets[iO][i * 3 + 2] = z + wMouth * 0.013;

        // viseme_E: wide horizontal left-right mouth articulation (ee / eh / ay / ي)
        targets[iE][i * 3] = lm.faceCenterX + relX * (1 + wMouth * 0.42);
        targets[iE][i * 3 + 1] = y + (upperW * 0.005 - lowerW * 0.004) + cornerW * 0.005;

        // viseme_PP: gentle horizontal lip press (m / b / p / ب / م)
        targets[iPP][i * 3] = lm.faceCenterX + relX * (1 + wMouth * 0.08);
        targets[iPP][i * 3 + 1] = y + (isLower ? lowerW * 0.006 : -upperW * 0.006);

        // mouthSmile: lifts & widens left and right mouth corners cleanly
        targets[iSmile][i * 3] = lm.faceCenterX + relX * (1 + cornerW * 0.24);
        targets[iSmile][i * 3 + 1] = y + cornerW * 0.013;
        targets[iSmile][i * 3 + 2] = z - cornerW * 0.004;

        // mouthFrown: gently pulls mouth corners down & narrows horizontally for sad/confused
        targets[iFrown][i * 3] = lm.faceCenterX + relX * (1 - cornerW * 0.08);
        targets[iFrown][i * 3 + 1] = y - cornerW * 0.012 - lowerW * 0.003;
        targets[iFrown][i * 3 + 2] = z + lowerW * 0.003;

        // viseme_FV: lower lip tucked slightly upward & inward toward upper teeth (ف / f / v)
        targets[iFV][i * 3] = lm.faceCenterX + relX * (1 + wMouth * 0.08);
        targets[iFV][i * 3 + 1] = y + (isLower ? lowerW * 0.007 : upperW * 0.005);
        targets[iFV][i * 3 + 2] = z + (isLower ? -lowerW * 0.008 : upperW * 0.004);

        // viseme_TH: gentle flat dental gap & wider lateral line (ث / ذ / ظ / ت / د / ط)
        targets[iTH][i * 3] = lm.faceCenterX + relX * (1 + wMouth * 0.22);
        targets[iTH][i * 3 + 1] = y - lowerW * 0.006 + upperW * 0.003;
        targets[iTH][i * 3 + 2] = z + upperW * 0.004;
      }
    }

    // 1b. Cheek squint / laugh lift under eyes
    if (
      z > lm.eyeZ - 0.05 &&
      y >= lm.mouthY + 0.01 &&
      y <= lm.eyeY - 0.004 &&
      Math.abs(relX) > 0.025 &&
      Math.abs(relX) < 0.095
    ) {
      const sideX = relX > 0 ? lm.eyeX * 1.05 : -lm.eyeX * 1.05;
      const cx = (relX - sideX) / 0.032;
      const cy = (y - THREE.MathUtils.lerp(lm.mouthY, lm.eyeY, 0.55)) / 0.024;
      const wCheek = gauss(cx * cx + cy * cy, 0.95);
      if (wCheek > 0.04) {
        targets[iCheek][i * 3 + 1] = y + wCheek * 0.011;
        targets[iCheek][i * 3 + 2] = z + wCheek * 0.004;
      }
    }

    // 2. Left & Right Upper Eyelids (eyeBlinkLeft, eyeBlinkRight)
    if (z > lm.eyeZ - 0.05 && Math.abs(y - lm.eyeY) < 0.04 && Math.abs(relX) > 0.02 && Math.abs(relX) < 0.1) {
      const isLeft = relX > 0;
      const ex = (relX - (isLeft ? lm.eyeX : -lm.eyeX)) / 0.026;
      const ey = (y - (lm.eyeY + 0.012)) / 0.02;
      const ez = (z - lm.eyeZ) / 0.04;
      const wEye = gauss(ex * ex + ey * ey + ez * ez, 0.8);
      if (wEye > 0.03 && y >= lm.eyeY - 0.006) {
        const bIdx = isLeft ? iBlinkL : iBlinkR;
        targets[bIdx][i * 3 + 1] = y - wEye * 0.022;
        targets[bIdx][i * 3 + 2] = z + wEye * 0.004;
      }
    }

    // 3. Eyebrows (browInnerUp, browDown)
    if (z > lm.eyeZ - 0.045 && Math.abs(y - lm.browY) < 0.035 && Math.abs(relX) > 0.015 && Math.abs(relX) < 0.1) {
      const sideX = relX > 0 ? lm.eyeX : -lm.eyeX;
      const bx = (relX - sideX) / 0.032;
      const by = (y - lm.browY) / 0.02;
      const bz = (z - lm.eyeZ) / 0.04;
      const wBrow = gauss(bx * bx + by * by + bz * bz, 0.8);
      if (wBrow > 0.03) {
        targets[iBrowUp][i * 3 + 1] = y + wBrow * 0.014;
        targets[iBrowDn][i * 3 + 1] = y - wBrow * 0.012;
        targets[iBrowDn][i * 3 + 2] = z + wBrow * 0.004;
      }
    }

    // 4. Nose Twitch
    if (z > lm.noseZ - 0.04 && Math.abs(y - lm.noseY) < 0.025 && Math.abs(relX) < 0.03) {
      const wNose = gauss((relX * relX) / 0.0005 + ((y - lm.noseY) * (y - lm.noseY)) / 0.0004, 1);
      if (wNose > 0.04) {
        targets[iNose][i * 3 + 1] = y + wNose * 0.008;
        targets[iNose][i * 3 + 2] = z + wNose * 0.004;
      }
    }

    // 5. Ears
    if (Math.abs(z) < 0.055 && Math.abs(y - lm.earY) < 0.05 && Math.abs(x) > lm.earX - 0.035) {
      const ex = (Math.abs(x) - lm.earX) / 0.03;
      const ey = (y - lm.earY) / 0.035;
      const wEar = gauss(ex * ex + ey * ey, 0.9);
      if (wEar > 0.04) {
        targets[iEar][i * 3 + 1] = y + wEar * 0.012;
        targets[iEar][i * 3 + 2] = z - wEar * 0.006;
      }
    }
  }

  geom.morphAttributes.position = targets.map(
    (arr) => new THREE.BufferAttribute(arr, 3),
  );
  geom.userData.morphTargetNames = targetNames;
  return targetNames;
}

/**
 * Computes crisp region-isolated automatic skin weights for a fitted biped skeleton so:
 * - Hair curls & hat brim above Neck NEVER bleed onto Shoulders/Arms
 * - Left and Right legs below Pelvis stay cleanly separated
 * - Fingers & wrists follow arm/hand chains without bleeding back into torso/legs
 */
export function computeRegionAwareBipedWeights(
  geometry: THREE.BufferGeometry,
  bones: THREE.Bone[],
  lm: StaticBipedLandmarks,
  falloffSharpness = 3.6,
): void {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const boneCount = bones.length;
  if (boneCount === 0 || vertexCount === 0) return;

  bones[0].updateMatrixWorld(true);

  const boneWorldPos = new Array<THREE.Vector3>(boneCount);
  const boneChildMean = new Array<THREE.Vector3>(boneCount);
  const hasChildSegment = new Array<boolean>(boneCount);

  const enum RegionGroup {
    CORE = 0,
    HEAD = 1,
    LEFT_ARM = 2,
    RIGHT_ARM = 3,
    LEFT_LEG = 4,
    RIGHT_LEG = 5,
  }
  const boneRegion = new Uint8Array(boneCount);

  for (let b = 0; b < boneCount; b++) {
    const name = bones[b].name;
    boneWorldPos[b] = new THREE.Vector3();
    boneChildMean[b] = new THREE.Vector3();
    bones[b].getWorldPosition(boneWorldPos[b]);

    const children = bones[b].children.filter((c): c is THREE.Bone => (c as THREE.Bone).isBone);
    if (children.length > 0) {
      const tmp = new THREE.Vector3();
      for (const cb of children) {
        cb.getWorldPosition(tmp);
        boneChildMean[b].add(tmp);
      }
      boneChildMean[b].divideScalar(children.length);
      hasChildSegment[b] = true;
    } else {
      boneChildMean[b].copy(boneWorldPos[b]);
      hasChildSegment[b] = false;
    }

    if (
      name === 'Head' ||
      name === 'Jaw' ||
      name.includes('Eye') ||
      name.includes('Brow') ||
      name === 'Nose' ||
      name.includes('Ear')
    ) {
      boneRegion[b] = RegionGroup.HEAD;
    } else if (name.startsWith('Left') && (name.includes('Arm') || name.includes('Hand') || name.includes('Shoulder') || name.includes('Thumb') || name.includes('Index') || name.includes('Middle') || name.includes('Ring') || name.includes('Pinky'))) {
      boneRegion[b] = RegionGroup.LEFT_ARM;
    } else if (name.startsWith('Right') && (name.includes('Arm') || name.includes('Hand') || name.includes('Shoulder') || name.includes('Thumb') || name.includes('Index') || name.includes('Middle') || name.includes('Ring') || name.includes('Pinky'))) {
      boneRegion[b] = RegionGroup.RIGHT_ARM;
    } else if (name.startsWith('Left')) {
      boneRegion[b] = RegionGroup.LEFT_LEG;
    } else if (name.startsWith('Right')) {
      boneRegion[b] = RegionGroup.RIGHT_LEG;
    } else {
      boneRegion[b] = RegionGroup.CORE;
    }
  }

  const headBoneIdx = bones.findIndex((b) => b.name === 'Head');
  const neckBoneIdx = bones.findIndex((b) => b.name === 'Neck');

  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  const topIndices = [0, 0, 0, 0];
  const topScores = [0, 0, 0, 0];

  for (let i = 0; i < vertexCount; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pz = posAttr.getZ(i);

    // Rigidly lock Head/Hair/Hat above Neck+0.025 (never deform hair curls with arms!)
    if (py >= lm.neckY + 0.025 && headBoneIdx >= 0) {
      const blendNeck =
        py < lm.neckY + 0.065 && neckBoneIdx >= 0
          ? THREE.MathUtils.clamp((lm.neckY + 0.065 - py) / 0.04, 0, 0.35)
          : 0;
      const base = i * 4;
      skinIndices[base] = headBoneIdx;
      skinWeights[base] = 1 - blendNeck;
      if (blendNeck > 0 && neckBoneIdx >= 0) {
        skinIndices[base + 1] = neckBoneIdx;
        skinWeights[base + 1] = blendNeck;
      }
      continue;
    }

    // Determine allowed bone regions for this vertex
    const inLegZone = py < lm.pelvisY - 0.04;
    const inArmZoneLeft = px > lm.leftShoulder.x - 0.015 && py >= lm.pelvisY * 0.85 && py < lm.neckY + 0.01;
    const inArmZoneRight = px < lm.rightShoulder.x + 0.015 && py >= lm.pelvisY * 0.85 && py < lm.neckY + 0.01;

    topIndices[0] = topIndices[1] = topIndices[2] = topIndices[3] = 0;
    topScores[0] = topScores[1] = topScores[2] = topScores[3] = 0;

    for (let b = 0; b < boneCount; b++) {
      const reg = boneRegion[b];

      // Isolate legs by X side
      if (inLegZone) {
        if (reg === RegionGroup.HEAD || reg === RegionGroup.LEFT_ARM || reg === RegionGroup.RIGHT_ARM) continue;
        if (px > 0.008 && reg === RegionGroup.RIGHT_LEG) continue;
        if (px < -0.008 && reg === RegionGroup.LEFT_LEG) continue;
      } else if (inArmZoneLeft) {
        if (reg === RegionGroup.HEAD || reg === RegionGroup.RIGHT_ARM || reg === RegionGroup.LEFT_LEG || reg === RegionGroup.RIGHT_LEG) continue;
        if (px > lm.leftShoulder.x + 0.05 && reg === RegionGroup.CORE) continue;
      } else if (inArmZoneRight) {
        if (reg === RegionGroup.HEAD || reg === RegionGroup.LEFT_ARM || reg === RegionGroup.LEFT_LEG || reg === RegionGroup.RIGHT_LEG) continue;
        if (px < lm.rightShoulder.x - 0.05 && reg === RegionGroup.CORE) continue;
      } else {
        // Torso / Neck
        if (py < lm.chestY && reg === RegionGroup.HEAD) continue;
      }

      const ax = boneWorldPos[b].x;
      const ay = boneWorldPos[b].y;
      const az = boneWorldPos[b].z;

      let distSq: number;
      if (hasChildSegment[b]) {
        const bx = ax + (boneChildMean[b].x - ax) * 0.88;
        const by = ay + (boneChildMean[b].y - ay) * 0.88;
        const bz = az + (boneChildMean[b].z - az) * 0.88;
        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const lenSq = abx * abx + aby * aby + abz * abz;
        let t = 0;
        if (lenSq > 1e-8) {
          t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
        }
        const cx = ax + abx * t;
        const cy = ay + aby * t;
        const cz = az + abz * t;
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        distSq = dx * dx + dy * dy + dz * dz;
      } else {
        const dx = px - ax;
        const dy = py - ay;
        const dz = pz - az;
        distSq = dx * dx + dy * dy + dz * dz;
      }

      const dist = Math.sqrt(distSq) + 0.015;
      const score = Math.pow(1 / dist, falloffSharpness);

      if (score > topScores[3]) {
        topScores[3] = score;
        topIndices[3] = b;
        for (let k = 2; k >= 0; k--) {
          if (topScores[k + 1] > topScores[k]) {
            const ts = topScores[k];
            const ti = topIndices[k];
            topScores[k] = topScores[k + 1];
            topIndices[k] = topIndices[k + 1];
            topScores[k + 1] = ts;
            topIndices[k + 1] = ti;
          }
        }
      }
    }

    const sum = topScores[0] + topScores[1] + topScores[2] + topScores[3];
    const base = i * 4;
    if (sum > 1e-8) {
      for (let k = 0; k < 4; k++) {
        skinIndices[base + k] = topIndices[k];
        skinWeights[base + k] = topScores[k] / sum;
      }
    } else {
      skinIndices[base] = 0;
      skinWeights[base] = 1;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.attributes.skinIndex.needsUpdate = true;
  geometry.attributes.skinWeight.needsUpdate = true;
}
