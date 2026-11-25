import * as THREE from 'three';
import { ArmRestBasis } from './autoRigStaticModel';
import { AnimationPresetId, KeyframePose } from './types';

function quatTupleFromEuler(
  xDeg: number,
  yDeg: number,
  zDeg: number,
  basis?: { pre: THREE.Quaternion; post: THREE.Quaternion },
): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(xDeg),
      THREE.MathUtils.degToRad(yDeg),
      THREE.MathUtils.degToRad(zDeg),
      'XYZ',
    ),
  );
  if (basis) {
    // Multiply pre * delta * post WITHOUT overwriting delta in-place!
    q.premultiply(basis.pre).multiply(basis.post);
  }
  return [q.x, q.y, q.z, q.w];
}

/**
 * Generates clean procedural skeletal AnimationClips for the active skeleton.
 * Adapts automatically to biped or quadruped bone naming conventions and A-pose rest arms.
 */
export function buildPresetAnimationClip(
  preset: AnimationPresetId,
  bones: THREE.Bone[],
  armRestBasis?: ArmRestBasis,
  pelvisRestPos?: THREE.Vector3,
): THREE.AnimationClip | null {
  if (preset === 'none' || preset === 'custom' || bones.length === 0) return null;

  const hasBone = (name: string) => bones.some((b) => b.name === name);
  const isQuadruped = hasBone('FrontLeftUpperLeg');
  const pelvisBone = bones.find((b) => b.name === 'Pelvis');
  const basePelvis = pelvisRestPos
    ? pelvisRestPos.clone()
    : pelvisBone
      ? pelvisBone.position.clone()
      : new THREE.Vector3(0, 0.88, 0);

  const makeQuatTrack = (
    boneName: string,
    times: number[],
    eulersDeg: [number, number, number][],
  ): THREE.QuaternionKeyframeTrack => {
    const basis = armRestBasis?.[boneName];
    const values: number[] = [];
    for (const [rx, ry, rz] of eulersDeg) {
      values.push(...quatTupleFromEuler(rx, ry, rz, basis));
    }
    return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
  };

  const makePosTrack = (
    boneName: string,
    times: number[],
    offsets: [number, number, number][],
    base: THREE.Vector3 = basePelvis,
  ): THREE.VectorKeyframeTrack => {
    const values: number[] = [];
    for (const [dx, dy, dz] of offsets) {
      values.push(base.x + dx, base.y + dy, base.z + dz);
    }
    return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, values);
  };

  const tracks: THREE.KeyframeTrack[] = [];

  if (isQuadruped) {
    if (preset === 'idle') {
      const t = [0, 1.2, 2.4];
      if (hasBone('Spine')) {
        tracks.push(makeQuatTrack('Spine', t, [[0, 0, 0], [3, 0, 0], [0, 0, 0]]));
      }
      if (hasBone('Head')) {
        tracks.push(makeQuatTrack('Head', t, [[0, -6, 0], [-4, 6, 0], [0, -6, 0]]));
      }
      if (hasBone('TailBase')) {
        tracks.push(makeQuatTrack('TailBase', [0, 0.6, 1.2, 1.8, 2.4], [[15, -18, 0], [18, 18, 0], [15, -18, 0], [18, 18, 0], [15, -18, 0]]));
      }
      return new THREE.AnimationClip('Idle', 2.4, tracks);
    }

    // Quadruped walk / run / hero / playful
    const dur = preset === 'run' || preset === 'monkey' || preset === 'backflip' ? 0.7 : 1.2;
    const t = [0, dur * 0.25, dur * 0.5, dur * 0.75, dur];
    const amp = preset === 'run' || preset === 'monkey' ? 38 : 24;

    if (hasBone('FrontLeftUpperLeg')) {
      tracks.push(makeQuatTrack('FrontLeftUpperLeg', t, [[amp, 0, 0], [0, 0, 0], [-amp, 0, 0], [-amp * 0.2, 0, 0], [amp, 0, 0]]));
    }
    if (hasBone('FrontRightUpperLeg')) {
      tracks.push(makeQuatTrack('FrontRightUpperLeg', t, [[-amp, 0, 0], [-amp * 0.2, 0, 0], [amp, 0, 0], [0, 0, 0], [-amp, 0, 0]]));
    }
    if (hasBone('BackLeftUpperLeg')) {
      tracks.push(makeQuatTrack('BackLeftUpperLeg', t, [[-amp, 0, 0], [0, 0, 0], [amp, 0, 0], [amp * 0.2, 0, 0], [-amp, 0, 0]]));
    }
    if (hasBone('BackRightUpperLeg')) {
      tracks.push(makeQuatTrack('BackRightUpperLeg', t, [[amp, 0, 0], [amp * 0.2, 0, 0], [-amp, 0, 0], [0, 0, 0], [amp, 0, 0]]));
    }
    if (hasBone('TailBase')) {
      tracks.push(makeQuatTrack('TailBase', t, [[12, -16, 0], [16, 0, 0], [12, 16, 0], [16, 0, 0], [12, -16, 0]]));
    }
    if (hasBone('Head')) {
      tracks.push(makeQuatTrack('Head', t, [[-4, 0, 0], [4, 0, 0], [-4, 0, 0], [4, 0, 0], [-4, 0, 0]]));
    }
    return new THREE.AnimationClip(preset, dur, tracks);
  }

  // Biped animations
  if (preset === 'idle') {
    const t = [0, 1.5, 3.0];
    if (hasBone('Pelvis')) tracks.push(makePosTrack('Pelvis', t, [[0, -0.01, 0], [0, 0, 0], [0, -0.01, 0]]));
    if (hasBone('Spine')) tracks.push(makeQuatTrack('Spine', t, [[0, 0, 0], [3.5, 0, 0], [0, 0, 0]]));
    if (hasBone('Chest')) tracks.push(makeQuatTrack('Chest', t, [[0, 0, 0], [-4, 0, 0], [0, 0, 0]]));
    if (hasBone('Head')) tracks.push(makeQuatTrack('Head', t, [[0, -4, 0], [2, 4, 0], [0, -4, 0]]));
    if (hasBone('LeftUpperArm')) tracks.push(makeQuatTrack('LeftUpperArm', t, [[3, -8, -70], [3, -9, -68], [3, -8, -70]]));
    if (hasBone('LeftForearm')) tracks.push(makeQuatTrack('LeftForearm', t, [[0, -20, 0], [0, -24, 0], [0, -20, 0]]));
    if (hasBone('RightUpperArm')) tracks.push(makeQuatTrack('RightUpperArm', t, [[3, 8, 70], [3, 9, 68], [3, 8, 70]]));
    if (hasBone('RightForearm')) tracks.push(makeQuatTrack('RightForearm', t, [[0, 20, 0], [0, 24, 0], [0, 20, 0]]));
    if (hasBone('LeftThigh')) tracks.push(makeQuatTrack('LeftThigh', t, [[-3, 2, 2], [-3, 2, 2], [-3, 2, 2]]));
    if (hasBone('LeftShin')) tracks.push(makeQuatTrack('LeftShin', t, [[6, 0, 0], [6, 0, 0], [6, 0, 0]]));
    if (hasBone('RightThigh')) tracks.push(makeQuatTrack('RightThigh', t, [[-3, -2, -2], [-3, -2, -2], [-3, -2, -2]]));
    if (hasBone('RightShin')) tracks.push(makeQuatTrack('RightShin', t, [[6, 0, 0], [6, 0, 0], [6, 0, 0]]));
    return new THREE.AnimationClip('Idle', 3.0, tracks);
  }

  if (preset === 'walk') {
    const dur = 1.2;
    const t = [0, 0.3, 0.6, 0.9, 1.2];
    if (hasBone('Pelvis')) {
      tracks.push(makeQuatTrack('Pelvis', t, [[0, 5, 0], [0, 0, 2], [0, -5, 0], [0, 0, -2], [0, 5, 0]]));
      tracks.push(makePosTrack('Pelvis', t, [[0, -0.02, 0], [0, 0.015, 0], [0, -0.02, 0], [0, 0.015, 0], [0, -0.02, 0]]));
    }
    if (hasBone('Spine')) {
      tracks.push(makeQuatTrack('Spine', t, [[3, -4, 0], [2, 0, 0], [3, 4, 0], [2, 0, 0], [3, -4, 0]]));
    }
    if (hasBone('LeftThigh')) {
      tracks.push(makeQuatTrack('LeftThigh', t, [[-28, 0, 0], [-4, 0, 0], [24, 0, 0], [-6, 0, 0], [-28, 0, 0]]));
    }
    if (hasBone('LeftShin')) {
      tracks.push(makeQuatTrack('LeftShin', t, [[8, 0, 0], [18, 0, 0], [10, 0, 0], [45, 0, 0], [8, 0, 0]]));
    }
    if (hasBone('RightThigh')) {
      tracks.push(makeQuatTrack('RightThigh', t, [[24, 0, 0], [-6, 0, 0], [-28, 0, 0], [-4, 0, 0], [24, 0, 0]]));
    }
    if (hasBone('RightShin')) {
      tracks.push(makeQuatTrack('RightShin', t, [[10, 0, 0], [45, 0, 0], [8, 0, 0], [18, 0, 0], [10, 0, 0]]));
    }
    if (hasBone('LeftUpperArm')) {
      tracks.push(makeQuatTrack('LeftUpperArm', t, [[0, 20, -70], [0, 0, -70], [0, -24, -70], [0, 0, -70], [0, 20, -70]]));
    }
    if (hasBone('LeftForearm')) {
      tracks.push(makeQuatTrack('LeftForearm', t, [[0, -12, 0], [0, -18, 0], [0, -32, 0], [0, -18, 0], [0, -12, 0]]));
    }
    if (hasBone('RightUpperArm')) {
      tracks.push(makeQuatTrack('RightUpperArm', t, [[0, 24, 70], [0, 0, 70], [0, -20, 70], [0, 0, 70], [0, 24, 70]]));
    }
    if (hasBone('RightForearm')) {
      tracks.push(makeQuatTrack('RightForearm', t, [[0, 32, 0], [0, 18, 0], [0, 12, 0], [0, 18, 0], [0, 32, 0]]));
    }
    return new THREE.AnimationClip('Walk', dur, tracks);
  }

  if (preset === 'run') {
    const dur = 0.72;
    const t = [0, 0.18, 0.36, 0.54, 0.72];
    if (hasBone('Pelvis')) {
      tracks.push(makePosTrack('Pelvis', t, [[0, -0.03, 0], [0, 0.04, 0], [0, -0.03, 0], [0, 0.04, 0], [0, -0.03, 0]]));
    }
    if (hasBone('Spine')) {
      tracks.push(makeQuatTrack('Spine', t, [[12, -8, 0], [14, 0, 0], [12, 8, 0], [14, 0, 0], [12, -8, 0]]));
    }
    if (hasBone('LeftThigh')) {
      tracks.push(makeQuatTrack('LeftThigh', t, [[-48, 0, 0], [0, 0, 0], [42, 0, 0], [-15, 0, 0], [-48, 0, 0]]));
    }
    if (hasBone('LeftShin')) {
      tracks.push(makeQuatTrack('LeftShin', t, [[25, 0, 0], [15, 0, 0], [20, 0, 0], [82, 0, 0], [25, 0, 0]]));
    }
    if (hasBone('RightThigh')) {
      tracks.push(makeQuatTrack('RightThigh', t, [[42, 0, 0], [-15, 0, 0], [-48, 0, 0], [0, 0, 0], [42, 0, 0]]));
    }
    if (hasBone('RightShin')) {
      tracks.push(makeQuatTrack('RightShin', t, [[20, 0, 0], [82, 0, 0], [25, 0, 0], [15, 0, 0], [20, 0, 0]]));
    }
    if (hasBone('LeftUpperArm')) {
      tracks.push(makeQuatTrack('LeftUpperArm', t, [[0, 36, -65], [0, 0, -65], [0, -40, -65], [0, 0, -65], [0, 36, -65]]));
    }
    if (hasBone('LeftForearm')) {
      tracks.push(makeQuatTrack('LeftForearm', t, [[0, -70, 0], [0, -65, 0], [0, -82, 0], [0, -65, 0], [0, -70, 0]]));
    }
    if (hasBone('RightUpperArm')) {
      tracks.push(makeQuatTrack('RightUpperArm', t, [[0, 40, 65], [0, 0, 65], [0, -36, 65], [0, 0, 65], [0, 40, 65]]));
    }
    if (hasBone('RightForearm')) {
      tracks.push(makeQuatTrack('RightForearm', t, [[0, 82, 0], [0, 65, 0], [0, 70, 0], [0, 65, 0], [0, 82, 0]]));
    }
    return new THREE.AnimationClip('Run', dur, tracks);
  }

  if (preset === 'wave') {
    const dur = 1.6;
    const t = [0, 0.4, 0.8, 1.2, 1.6];
    if (hasBone('Pelvis')) {
      tracks.push(makePosTrack('Pelvis', t, [[0, -0.015, 0], [0.02, -0.01, 0], [0, -0.015, 0], [-0.02, -0.01, 0], [0, -0.015, 0]]));
      tracks.push(makeQuatTrack('Pelvis', t, [[1, 3, -1], [1, 5, 1], [1, 3, -1], [1, 1, -2], [1, 3, -1]]));
    }
    if (hasBone('Chest')) {
      tracks.push(makeQuatTrack('Chest', t, [[-1, 3, -2], [-2, 4, -1], [-1, 3, -2], [-2, 2, -2], [-1, 3, -2]]));
    }
    if (hasBone('RightUpperArm')) {
      tracks.push(makeQuatTrack('RightUpperArm', t, [[7, 20, 16], [7, 20, 15], [7, 20, 16], [7, 20, 15], [7, 20, 16]]));
    }
    if (hasBone('RightForearm')) {
      tracks.push(makeQuatTrack('RightForearm', t, [[0, 14, -88], [0, 14, -114], [0, 14, -88], [0, 14, -114], [0, 14, -88]]));
    }
    if (hasBone('RightHand')) {
      tracks.push(makeQuatTrack('RightHand', t, [[12, 6, -15], [12, 6, 15], [12, 6, -15], [12, 6, 15], [12, 6, -15]]));
    }
    if (hasBone('LeftUpperArm')) {
      tracks.push(makeQuatTrack('LeftUpperArm', t, [[3, -8, -66], [3, -9, -64], [3, -8, -66], [3, -9, -64], [3, -8, -66]]));
    }
    if (hasBone('LeftForearm')) {
      tracks.push(makeQuatTrack('LeftForearm', t, [[0, -28, 0], [0, -32, 0], [0, -28, 0], [0, -32, 0], [0, -28, 0]]));
    }
    if (hasBone('Head')) {
      tracks.push(makeQuatTrack('Head', t, [[-2, -4, 4], [0, 0, 2], [-2, -4, 4], [0, 0, 2], [-2, -4, 4]]));
    }
    if (hasBone('LeftThigh')) tracks.push(makeQuatTrack('LeftThigh', t, [[-4, 3, 3], [-4, 3, 3], [-4, 3, 3], [-4, 3, 3], [-4, 3, 3]]));
    if (hasBone('LeftShin')) tracks.push(makeQuatTrack('LeftShin', t, [[8, 0, 0], [8, 0, 0], [8, 0, 0], [8, 0, 0], [8, 0, 0]]));
    if (hasBone('RightThigh')) tracks.push(makeQuatTrack('RightThigh', t, [[-5, -3, -2], [-5, -3, -2], [-5, -3, -2], [-5, -3, -2], [-5, -3, -2]]));
    if (hasBone('RightShin')) tracks.push(makeQuatTrack('RightShin', t, [[10, 0, 0], [10, 0, 0], [10, 0, 0], [10, 0, 0], [10, 0, 0]]));
    return new THREE.AnimationClip('Wave', dur, tracks);
  }

  if (preset === 'think') {
    const dur = 2.8;
    const t = [0, 0.7, 1.4, 2.1, 2.8];
    if (hasBone('Pelvis')) {
      tracks.push(makePosTrack('Pelvis', t, [[0, -0.02, 0], [0.015, -0.018, 0], [0, -0.02, 0], [-0.015, -0.018, 0], [0, -0.02, 0]]));
      tracks.push(makeQuatTrack('Pelvis', t, [[1, -4, 1], [1, -3, 1], [1, -4, 1], [1, -5, 1], [1, -4, 1]]));
    }
    if (hasBone('Spine')) tracks.push(makeQuatTrack('Spine', t, [[3, 3, -2], [3, 4, -2], [3, 3, -2], [3, 2, -2], [3, 3, -2]]));
    if (hasBone('Chest')) tracks.push(makeQuatTrack('Chest', t, [[2, 4, -2], [3, 5, -2], [2, 4, -2], [1, 3, -2], [2, 4, -2]]));
    if (hasBone('Head')) tracks.push(makeQuatTrack('Head', t, [[-3, -6, 7], [-5, -3, 8], [-3, -6, 7], [-1, -8, 6], [-3, -6, 7]]));
    if (hasBone('RightUpperArm')) tracks.push(makeQuatTrack('RightUpperArm', t, [[-23, 66, 37], [-23, 66, 37], [-23, 66, 37], [-23, 66, 37], [-23, 66, 37]]));
    if (hasBone('RightForearm')) tracks.push(makeQuatTrack('RightForearm', t, [[0, 106, -26], [0, 108, -24], [0, 106, -26], [0, 104, -28], [0, 106, -26]]));
    if (hasBone('RightHand')) tracks.push(makeQuatTrack('RightHand', t, [[6, 12, -14], [8, 18, -12], [6, 12, -14], [4, 6, -16], [6, 12, -14]]));
    if (hasBone('LeftUpperArm')) tracks.push(makeQuatTrack('LeftUpperArm', t, [[6, -49, -54], [6, -49, -54], [6, -49, -54], [6, -49, -54], [6, -49, -54]]));
    if (hasBone('LeftForearm')) tracks.push(makeQuatTrack('LeftForearm', t, [[0, -89, 8], [0, -89, 8], [0, -89, 8], [0, -89, 8], [0, -89, 8]]));
    if (hasBone('LeftThigh')) tracks.push(makeQuatTrack('LeftThigh', t, [[-5, 2, 3], [-5, 2, 3], [-5, 2, 3], [-5, 2, 3], [-5, 2, 3]]));
    if (hasBone('LeftShin')) tracks.push(makeQuatTrack('LeftShin', t, [[10, 0, 0], [10, 0, 0], [10, 0, 0], [10, 0, 0], [10, 0, 0]]));
    if (hasBone('RightThigh')) tracks.push(makeQuatTrack('RightThigh', t, [[-8, -3, -2], [-8, -3, -2], [-8, -3, -2], [-8, -3, -2], [-8, -3, -2]]));
    if (hasBone('RightShin')) tracks.push(makeQuatTrack('RightShin', t, [[15, 0, 0], [15, 0, 0], [15, 0, 0], [15, 0, 0], [15, 0, 0]]));
    return new THREE.AnimationClip('Think', dur, tracks);
  }

  if (preset === 'clap') {
    const dur = 1.2;
    const t = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2];
    if (hasBone('Pelvis')) {
      tracks.push(
        makePosTrack('Pelvis', t, [
          [0, -0.025, 0], [0.01, 0.015, 0], [0, -0.025, 0], [-0.01, 0.015, 0],
          [0, -0.025, 0], [0.01, 0.015, 0], [0, -0.025, 0], [-0.01, 0.015, 0], [0, -0.025, 0],
        ]),
      );
      tracks.push(
        makeQuatTrack('Pelvis', t, [
          [2, 2, 1], [2, 0, 0], [2, -2, -1], [2, 0, 0],
          [2, 2, 1], [2, 0, 0], [2, -2, -1], [2, 0, 0], [2, 2, 1],
        ]),
      );
    }
    if (hasBone('Head')) {
      tracks.push(
        makeQuatTrack('Head', t, [
          [-2, 2, 2], [2, 0, 0], [-2, -2, -2], [2, 0, 0],
          [-2, 2, 2], [2, 0, 0], [-2, -2, -2], [2, 0, 0], [-2, 2, 2],
        ]),
      );
    }
    if (hasBone('LeftUpperArm')) {
      tracks.push(
        makeQuatTrack('LeftUpperArm', t, [
          [6, -60, -13], [6, -41, -17], [6, -60, -13], [6, -41, -17],
          [6, -60, -13], [6, -41, -17], [6, -60, -13], [6, -41, -17], [6, -60, -13],
        ]),
      );
    }
    if (hasBone('LeftForearm')) {
      tracks.push(
        makeQuatTrack('LeftForearm', t, [
          [0, -77, 18], [0, -61, 14], [0, -77, 18], [0, -61, 14],
          [0, -77, 18], [0, -61, 14], [0, -77, 18], [0, -61, 14], [0, -77, 18],
        ]),
      );
    }
    if (hasBone('RightUpperArm')) {
      tracks.push(
        makeQuatTrack('RightUpperArm', t, [
          [6, 60, 13], [6, 41, 17], [6, 60, 13], [6, 41, 17],
          [6, 60, 13], [6, 41, 17], [6, 60, 13], [6, 41, 17], [6, 60, 13],
        ]),
      );
    }
    if (hasBone('RightForearm')) {
      tracks.push(
        makeQuatTrack('RightForearm', t, [
          [0, 77, -18], [0, 61, -14], [0, 77, -18], [0, 61, -14],
          [0, 77, -18], [0, 61, -14], [0, 77, -18], [0, 61, -14], [0, 77, -18],
        ]),
      );
    }
    if (hasBone('LeftThigh')) {
      tracks.push(
        makeQuatTrack('LeftThigh', t, [
          [-8, 3, 3], [-4, 3, 3], [-8, 3, 3], [-4, 3, 3],
          [-8, 3, 3], [-4, 3, 3], [-8, 3, 3], [-4, 3, 3], [-8, 3, 3],
        ]),
      );
    }
    if (hasBone('LeftShin')) {
      tracks.push(
        makeQuatTrack('LeftShin', t, [
          [16, 0, 0], [8, 0, 0], [16, 0, 0], [8, 0, 0],
          [16, 0, 0], [8, 0, 0], [16, 0, 0], [8, 0, 0], [16, 0, 0],
        ]),
      );
    }
    if (hasBone('RightThigh')) {
      tracks.push(
        makeQuatTrack('RightThigh', t, [
          [-8, -3, -3], [-4, -3, -3], [-8, -3, -3], [-4, -3, -3],
          [-8, -3, -3], [-4, -3, -3], [-8, -3, -3], [-4, -3, -3], [-8, -3, -3],
        ]),
      );
    }
    if (hasBone('RightShin')) {
      tracks.push(
        makeQuatTrack('RightShin', t, [
          [16, 0, 0], [8, 0, 0], [16, 0, 0], [8, 0, 0],
          [16, 0, 0], [8, 0, 0], [16, 0, 0], [8, 0, 0], [16, 0, 0],
        ]),
      );
    }
    return new THREE.AnimationClip('Clap', dur, tracks);
  }

  if (preset === 'monkey') {
    const dur = 1.4;
    const t = [0, 0.35, 0.7, 1.05, 1.4];
    if (hasBone('Pelvis')) {
      tracks.push(
        makePosTrack('Pelvis', t, [
          [0, -0.14, 0.02],
          [0.055, -0.065, 0.02],
          [0, -0.14, 0.02],
          [-0.055, -0.065, 0.02],
          [0, -0.14, 0.02],
        ]),
      );
      tracks.push(makeQuatTrack('Pelvis', t, [[9, 0, 0], [9, 8, 5], [9, 0, 0], [9, -8, -5], [9, 0, 0]]));
    }
    if (hasBone('Spine')) tracks.push(makeQuatTrack('Spine', t, [[10, 0, 0], [10, -6, 0], [10, 0, 0], [10, 6, 0], [10, 0, 0]]));
    if (hasBone('Chest')) tracks.push(makeQuatTrack('Chest', t, [[8, 0, 0], [8, -7, 3], [8, 0, 0], [8, 7, -3], [8, 0, 0]]));
    if (hasBone('Head')) tracks.push(makeQuatTrack('Head', t, [[-8, 0, 0], [-11, 10, -7], [-8, 0, 0], [-11, -10, 7], [-8, 0, 0]]));
    if (hasBone('LeftUpperArm')) tracks.push(makeQuatTrack('LeftUpperArm', t, [[28, -20, -6], [0, -20, -46], [28, -20, -6], [0, -20, -46], [28, -20, -6]]));
    if (hasBone('LeftForearm')) tracks.push(makeQuatTrack('LeftForearm', t, [[0, -57, -63], [0, -86, -23], [0, -57, -63], [0, -86, -23], [0, -57, -63]]));
    if (hasBone('LeftHand')) tracks.push(makeQuatTrack('LeftHand', t, [[-12, 0, 26], [-52, 0, 26], [-12, 0, 26], [-52, 0, 26], [-12, 0, 26]]));
    if (hasBone('RightUpperArm')) tracks.push(makeQuatTrack('RightUpperArm', t, [[0, 20, 46], [28, 20, 6], [0, 20, 46], [28, 20, 6], [0, 20, 46]]));
    if (hasBone('RightForearm')) tracks.push(makeQuatTrack('RightForearm', t, [[0, 86, 23], [0, 57, 63], [0, 86, 23], [0, 57, 63], [0, 86, 23]]));
    if (hasBone('RightHand')) tracks.push(makeQuatTrack('RightHand', t, [[-52, 0, -26], [-12, 0, -26], [-52, 0, -26], [-12, 0, -26], [-52, 0, -26]]));
    if (hasBone('LeftThigh')) tracks.push(makeQuatTrack('LeftThigh', t, [[-36, 8, 10], [-42, 8, 10], [-36, 8, 10], [-42, 8, 10], [-36, 8, 10]]));
    if (hasBone('LeftShin')) tracks.push(makeQuatTrack('LeftShin', t, [[60, 0, 0], [69, 0, 0], [60, 0, 0], [69, 0, 0], [60, 0, 0]]));
    if (hasBone('RightThigh')) tracks.push(makeQuatTrack('RightThigh', t, [[-36, -8, -10], [-42, -8, -10], [-36, -8, -10], [-42, -8, -10], [-36, -8, -10]]));
    if (hasBone('RightShin')) tracks.push(makeQuatTrack('RightShin', t, [[60, 0, 0], [69, 0, 0], [60, 0, 0], [69, 0, 0], [60, 0, 0]]));
    return new THREE.AnimationClip('Monkey', dur, tracks);
  }

  if (preset === 'backflip') {
    // High kick + crouched takeoff + full 360° mid-air backflip + cushioned landing!
    const dur = 2.4;
    const t = [0, 0.35, 0.7, 1.0, 1.25, 1.5, 1.75, 2.05, 2.4];
    if (hasBone('Pelvis')) {
      tracks.push(
        makePosTrack('Pelvis', t, [
          [0, -0.02, 0],
          [0, 0.02, 0],
          [0, -0.1, 0],
          [0, 0.32, 0],
          [0, 0.52, 0],
          [0, 0.32, 0],
          [0, -0.09, 0],
          [0, -0.03, 0],
          [0, -0.02, 0],
        ]),
      );
      // Explicit axis-angle steps (< 180° apart) so SLERP completes a clean 360° backflip
      const xAngles = [0, -4, 12, -90, -180, -270, -352, -360, -360];
      const qVals: number[] = [];
      const qTmp = new THREE.Quaternion();
      const axisX = new THREE.Vector3(1, 0, 0);
      for (const deg of xAngles) {
        qTmp.setFromAxisAngle(axisX, THREE.MathUtils.degToRad(deg));
        qVals.push(qTmp.x, qTmp.y, qTmp.z, qTmp.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack('Pelvis.quaternion', t, qVals));
    }
    if (hasBone('Spine')) {
      tracks.push(makeQuatTrack('Spine', t, [[2, 0, 0], [-4, 0, 0], [10, 0, 0], [14, 0, 0], [16, 0, 0], [14, 0, 0], [8, 0, 0], [2, 0, 0], [2, 0, 0]]));
    }
    if (hasBone('Chest')) {
      tracks.push(makeQuatTrack('Chest', t, [[0, 0, 0], [-4, 0, 0], [8, 0, 0], [12, 0, 0], [14, 0, 0], [12, 0, 0], [6, 0, 0], [0, 0, 0], [0, 0, 0]]));
    }
    if (hasBone('LeftUpperArm')) {
      tracks.push(makeQuatTrack('LeftUpperArm', t, [[4, -18, -60], [12, -24, -36], [10, -30, -80], [0, -24, 18], [0, -24, 24], [0, -24, 18], [8, -24, -46], [6, -18, -60], [4, -18, -60]]));
    }
    if (hasBone('LeftForearm')) {
      tracks.push(makeQuatTrack('LeftForearm', t, [[0, -32, 12], [0, -55, 22], [0, -45, 0], [0, -66, 18], [0, -72, 20], [0, -66, 18], [0, -42, 14], [0, -32, 12], [0, -32, 12]]));
    }
    if (hasBone('RightUpperArm')) {
      tracks.push(makeQuatTrack('RightUpperArm', t, [[4, 18, 60], [12, 24, 36], [10, 30, 80], [0, 24, -18], [0, 24, -24], [0, 24, -18], [8, 24, 46], [6, 18, 60], [4, 18, 60]]));
    }
    if (hasBone('RightForearm')) {
      tracks.push(makeQuatTrack('RightForearm', t, [[0, 32, -12], [0, 55, -22], [0, 45, 0], [0, 66, -18], [0, 72, -20], [0, 66, -18], [0, 42, -14], [0, 32, -12], [0, 32, -12]]));
    }
    if (hasBone('RightThigh')) {
      tracks.push(makeQuatTrack('RightThigh', t, [[-6, -3, -2], [-78, -6, -6], [-32, -4, -4], [-68, -4, -4], [-78, -4, -4], [-64, -4, -4], [-28, -4, -4], [-8, -3, -2], [-6, -3, -2]]));
    }
    if (hasBone('RightShin')) {
      tracks.push(makeQuatTrack('RightShin', t, [[12, 0, 0], [14, 0, 0], [58, 0, 0], [96, 0, 0], [105, 0, 0], [92, 0, 0], [52, 0, 0], [16, 0, 0], [12, 0, 0]]));
    }
    if (hasBone('LeftThigh')) {
      tracks.push(makeQuatTrack('LeftThigh', t, [[-6, 3, 2], [-8, 3, 2], [-32, 4, 4], [-68, 4, 4], [-78, 4, 4], [-64, 4, 4], [-28, 4, 4], [-8, 3, 2], [-6, 3, 2]]));
    }
    if (hasBone('LeftShin')) {
      tracks.push(makeQuatTrack('LeftShin', t, [[12, 0, 0], [16, 0, 0], [58, 0, 0], [96, 0, 0], [105, 0, 0], [92, 0, 0], [52, 0, 0], [16, 0, 0], [12, 0, 0]]));
    }
    return new THREE.AnimationClip('Backflip', dur, tracks);
  }

  // 'hero'
  const dur = 2.4;
  const t = [0, 1.2, 2.4];
  if (hasBone('Pelvis')) tracks.push(makeQuatTrack('Pelvis', t, [[0, -14, 0], [0, -12, 0], [0, -14, 0]]));
  if (hasBone('Chest')) tracks.push(makeQuatTrack('Chest', t, [[-5, 14, 0], [-9, 14, 0], [-5, 14, 0]]));
  if (hasBone('Head')) tracks.push(makeQuatTrack('Head', t, [[3, 0, 0], [0, 2, 0], [3, 0, 0]]));
  if (hasBone('LeftUpperArm')) tracks.push(makeQuatTrack('LeftUpperArm', t, [[0, -16, -54], [0, -18, -50], [0, -16, -54]]));
  if (hasBone('LeftForearm')) tracks.push(makeQuatTrack('LeftForearm', t, [[0, -52, 0], [0, -56, 0], [0, -52, 0]]));
  if (hasBone('RightUpperArm')) tracks.push(makeQuatTrack('RightUpperArm', t, [[0, 18, 52], [0, 20, 48], [0, 18, 52]]));
  if (hasBone('RightForearm')) tracks.push(makeQuatTrack('RightForearm', t, [[0, 42, 0], [0, 46, 0], [0, 42, 0]]));
  if (hasBone('LeftThigh')) tracks.push(makeQuatTrack('LeftThigh', t, [[-16, 8, 6], [-16, 8, 6], [-16, 8, 6]]));
  if (hasBone('LeftShin')) tracks.push(makeQuatTrack('LeftShin', t, [[22, 0, 0], [22, 0, 0], [22, 0, 0]]));
  if (hasBone('RightThigh')) tracks.push(makeQuatTrack('RightThigh', t, [[14, -8, -6], [14, -8, -6], [14, -8, -6]]));
  if (hasBone('RightShin')) tracks.push(makeQuatTrack('RightShin', t, [[12, 0, 0], [12, 0, 0], [12, 0, 0]]));
  return new THREE.AnimationClip('HeroStance', dur, tracks);
}

/**
 * Compiles user-recorded KeyframePose items into a smooth looping THREE.AnimationClip.
 */
export function compileCustomAnimationClip(
  keyframes: KeyframePose[],
  bones: THREE.Bone[],
): THREE.AnimationClip | null {
  if (keyframes.length < 2 || bones.length === 0) return null;

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const times = sorted.map((k) => k.time);
  const duration = Math.max(0.5, times[times.length - 1]);

  const tracks: THREE.KeyframeTrack[] = [];

  for (const bone of bones) {
    const quatValues: number[] = [];
    const posValues: number[] = [];
    let hasQuatChange = false;
    let hasPosChange = false;

    for (const kf of sorted) {
      const entry = kf.bones[bone.name];
      if (entry) {
        quatValues.push(...entry.quaternion);
        posValues.push(...entry.position);
        hasQuatChange = true;
        hasPosChange = true;
      } else {
        quatValues.push(bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w);
        posValues.push(bone.position.x, bone.position.y, bone.position.z);
      }
    }

    if (hasQuatChange) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, quatValues));
    }
    if (hasPosChange) {
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, posValues));
    }
  }

  return new THREE.AnimationClip('CustomSequence', duration, tracks);
}
