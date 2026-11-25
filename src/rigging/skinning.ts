import * as THREE from 'three';

const _vPos = new THREE.Vector3();
const _segA = new THREE.Vector3();
const _segB = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _boneWorldPos: THREE.Vector3[] = [];
const _boneChildMean: THREE.Vector3[] = [];
const _hasChildSegment: boolean[] = [];

/**
 * Closest point on line segment AB to point P.
 */
function distanceToSegmentSq(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  outClosest: THREE.Vector3,
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-8) {
    outClosest.copy(a);
    return p.distanceToSquared(a);
  }
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / lenSq));
  outClosest.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return p.distanceToSquared(outClosest);
}

/**
 * Computes smooth segment-distance-based automatic bone weights for a BufferGeometry.
 * Stores up to 4 normalized bone influences per vertex in skinIndex and skinWeight.
 */
export function computeAutoSkinWeights(
  geometry: THREE.BufferGeometry,
  bones: THREE.Bone[],
  falloffSharpness = 3.2,
  meshMatrixWorld?: THREE.Matrix4,
): void {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const boneCount = bones.length;

  if (boneCount === 0 || vertexCount === 0) return;

  // Ensure world matrices on bones are current
  bones[0].updateMatrixWorld(true);

  _boneWorldPos.length = boneCount;
  _boneChildMean.length = boneCount;
  _hasChildSegment.length = boneCount;

  for (let b = 0; b < boneCount; b++) {
    if (!_boneWorldPos[b]) _boneWorldPos[b] = new THREE.Vector3();
    if (!_boneChildMean[b]) _boneChildMean[b] = new THREE.Vector3();
    bones[b].getWorldPosition(_boneWorldPos[b]);

    const childBones = bones[b].children.filter((c): c is THREE.Bone => (c as THREE.Bone).isBone);
    if (childBones.length > 0) {
      _boneChildMean[b].set(0, 0, 0);
      const tmp = new THREE.Vector3();
      for (const cb of childBones) {
        cb.getWorldPosition(tmp);
        _boneChildMean[b].add(tmp);
      }
      _boneChildMean[b].divideScalar(childBones.length);
      _hasChildSegment[b] = true;
    } else {
      _boneChildMean[b].copy(_boneWorldPos[b]);
      _hasChildSegment[b] = false;
    }
  }

  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  const invMeshMatrix = new THREE.Matrix4();
  const hasMeshMatrix = Boolean(meshMatrixWorld);
  if (meshMatrixWorld) {
    invMeshMatrix.copy(meshMatrixWorld);
  }

  const topIndices = [0, 0, 0, 0];
  const topScores = [0, 0, 0, 0];

  for (let i = 0; i < vertexCount; i++) {
    _vPos.fromBufferAttribute(posAttr, i);
    if (hasMeshMatrix) {
      _vPos.applyMatrix4(invMeshMatrix);
    }

    topIndices[0] = topIndices[1] = topIndices[2] = topIndices[3] = 0;
    topScores[0] = topScores[1] = topScores[2] = topScores[3] = 0;

    for (let b = 0; b < boneCount; b++) {
      _segA.copy(_boneWorldPos[b]);
      let distSq: number;
      if (_hasChildSegment[b]) {
        // Pull endpoint slightly inward (88%) so child bone keeps ownership of its own joint
        _segB.lerpVectors(_segA, _boneChildMean[b], 0.88);
        distSq = distanceToSegmentSq(_vPos, _segA, _segB, _closest);
      } else {
        distSq = _vPos.distanceToSquared(_segA);
      }

      const dist = Math.sqrt(distSq) + 0.015;
      const score = Math.pow(1 / dist, falloffSharpness);

      // Insert into top 4
      if (score > topScores[3]) {
        topScores[3] = score;
        topIndices[3] = b;
        // Bubble up
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

/**
 * Re-binds a SkinnedMesh's skeleton to its current bone positions.
 */
export function rebindSkeleton(skinnedMesh: THREE.SkinnedMesh): void {
  skinnedMesh.updateMatrixWorld(true);
  const skeleton = skinnedMesh.skeleton;
  if (!skeleton) return;
  skeleton.bones[0]?.updateMatrixWorld(true);
  skeleton.calculateInverses();
  skinnedMesh.bind(skeleton, skinnedMesh.matrixWorld);
}

/**
 * Finds the weight of a specific boneIndex on vertex vIdx.
 */
export function getVertexBoneWeight(
  skinIndexAttr: THREE.BufferAttribute,
  skinWeightAttr: THREE.BufferAttribute,
  vIdx: number,
  boneIndex: number,
): number {
  let w = 0;
  for (let k = 0; k < 4; k++) {
    const idx = Math.round(skinIndexAttr.getComponent(vIdx, k));
    if (idx === boneIndex) {
      w += skinWeightAttr.getComponent(vIdx, k);
    }
  }
  return Math.min(1, Math.max(0, w));
}

/**
 * Sets or adjusts the weight for boneIndex on a single vertex and re-normalizes remaining influences.
 */
function setVertexBoneWeightNormalized(
  skinIndexAttr: THREE.BufferAttribute,
  skinWeightAttr: THREE.BufferAttribute,
  vIdx: number,
  boneIndex: number,
  newWeight: number,
): void {
  const clamped = Math.max(0, Math.min(1, newWeight));
  const indices = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];
  let foundSlot = -1;
  let otherSum = 0;

  for (let k = 0; k < 4; k++) {
    indices[k] = Math.round(skinIndexAttr.getComponent(vIdx, k));
    weights[k] = skinWeightAttr.getComponent(vIdx, k);
    if (indices[k] === boneIndex) {
      if (foundSlot === -1) {
        foundSlot = k;
      } else {
        weights[k] = 0;
      }
    } else {
      otherSum += weights[k];
    }
  }

  if (foundSlot === -1) {
    // Replace smallest slot
    let minSlot = 0;
    for (let k = 1; k < 4; k++) {
      if (weights[k] < weights[minSlot]) minSlot = k;
    }
    otherSum -= weights[minSlot];
    foundSlot = minSlot;
    indices[foundSlot] = boneIndex;
  }

  weights[foundSlot] = clamped;
  const targetOther = 1 - clamped;

  if (otherSum > 1e-6) {
    const scale = targetOther / otherSum;
    for (let k = 0; k < 4; k++) {
      if (k !== foundSlot) weights[k] *= scale;
    }
  } else if (targetOther > 1e-5) {
    // Distribute remainder to root bone 0 (or bone 1 if root is painted)
    const fallbackBone = boneIndex === 0 ? 1 : 0;
    for (let k = 0; k < 4; k++) {
      if (k !== foundSlot) {
        indices[k] = fallbackBone;
        weights[k] = targetOther;
        break;
      }
    }
  }

  // Write back
  for (let k = 0; k < 4; k++) {
    skinIndexAttr.setComponent(vIdx, k, indices[k]);
    skinWeightAttr.setComponent(vIdx, k, weights[k]);
  }
}

/**
 * Interactive 3D weight brush: paints bone weights in world/local space around a hit point.
 * Returns number of affected vertices.
 */
export function paintVertexWeights(
  skinnedMesh: THREE.SkinnedMesh,
  hitPointWorld: THREE.Vector3,
  boneIndex: number,
  radius: number,
  strength: number,
  mode: 'add' | 'subtract' | 'smooth',
): number {
  const geom = skinnedMesh.geometry;
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const skinIndexAttr = geom.attributes.skinIndex as THREE.BufferAttribute;
  const skinWeightAttr = geom.attributes.skinWeight as THREE.BufferAttribute;
  if (!posAttr || !skinIndexAttr || !skinWeightAttr) return 0;

  // Convert world hit point to mesh local space (rest pose approximation)
  const localHit = skinnedMesh.worldToLocal(hitPointWorld.clone());
  const radiusSq = radius * radius;
  let affected = 0;

  // Collect neighbors inside brush for smooth mode
  const insideVertices: { idx: number; dist: number; currentWeight: number }[] = [];
  let meanWeight = 0;

  for (let i = 0; i < posAttr.count; i++) {
    _vPos.fromBufferAttribute(posAttr, i);
    const dSq = _vPos.distanceToSquared(localHit);
    if (dSq <= radiusSq) {
      const dist = Math.sqrt(dSq);
      const currentWeight = getVertexBoneWeight(skinIndexAttr, skinWeightAttr, i, boneIndex);
      insideVertices.push({ idx: i, dist, currentWeight });
      meanWeight += currentWeight;
    }
  }

  if (insideVertices.length === 0) return 0;
  meanWeight /= insideVertices.length;

  for (const item of insideVertices) {
    const t = 1 - item.dist / radius;
    const falloff = t * t * (3 - 2 * t); // smoothstep falloff
    const delta = strength * falloff * 0.35;

    let nextWeight = item.currentWeight;
    if (mode === 'add') {
      nextWeight = item.currentWeight + delta;
    } else if (mode === 'subtract') {
      nextWeight = item.currentWeight - delta;
    } else {
      nextWeight = THREE.MathUtils.lerp(item.currentWeight, meanWeight, falloff * strength * 0.5);
    }

    setVertexBoneWeightNormalized(skinIndexAttr, skinWeightAttr, item.idx, boneIndex, nextWeight);
    affected++;
  }

  skinIndexAttr.needsUpdate = true;
  skinWeightAttr.needsUpdate = true;
  return affected;
}

const _heatColor = new THREE.Color();
const _c0 = new THREE.Color('#1e293b'); // 0.00 - neutral dark slate
const _c1 = new THREE.Color('#2563eb'); // 0.25 - royal blue
const _c2 = new THREE.Color('#10b981'); // 0.50 - emerald
const _c3 = new THREE.Color('#f59e0b'); // 0.75 - amber
const _c4 = new THREE.Color('#ef4444'); // 1.00 - crimson

function weightToHeatmapColor(w: number, target: THREE.Color): void {
  const clamped = Math.max(0, Math.min(1, w));
  if (clamped < 0.25) {
    target.lerpColors(_c0, _c1, clamped / 0.25);
  } else if (clamped < 0.5) {
    target.lerpColors(_c1, _c2, (clamped - 0.25) / 0.25);
  } else if (clamped < 0.75) {
    target.lerpColors(_c2, _c3, (clamped - 0.5) / 0.25);
  } else {
    target.lerpColors(_c3, _c4, (clamped - 0.75) / 0.25);
  }
}

/**
 * Applies or restores vertex colors on a geometry to visualize weights for a given boneIndex.
 */
export function applyWeightHeatmapColors(
  geometry: THREE.BufferGeometry,
  boneIndex: number,
  enableHeatmap: boolean,
): void {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;

  // Stash base vertex colors on userData if not already saved
  if (geometry.userData.hadOrigColor === undefined) {
    geometry.userData.hadOrigColor = Boolean(geometry.attributes.color);
  }
  if (!geometry.userData.baseColors && geometry.attributes.color) {
    geometry.userData.baseColors = new Float32Array(
      (geometry.attributes.color as THREE.BufferAttribute).array as ArrayLike<number>,
    );
  }

  if (!enableHeatmap) {
    if (geometry.userData.hadOrigColor && geometry.userData.baseColors) {
      const baseColors = geometry.userData.baseColors as Float32Array;
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(baseColors), 3));
      geometry.attributes.color.needsUpdate = true;
    } else if (geometry.attributes.color) {
      geometry.deleteAttribute('color');
    }
    return;
  }

  const skinIndexAttr = geometry.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const skinWeightAttr = geometry.attributes.skinWeight as THREE.BufferAttribute | undefined;
  const heatArray = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const w =
      skinIndexAttr && skinWeightAttr
        ? getVertexBoneWeight(skinIndexAttr, skinWeightAttr, i, boneIndex)
        : 0;
    weightToHeatmapColor(w, _heatColor);
    heatArray[i * 3] = _heatColor.r;
    heatArray[i * 3 + 1] = _heatColor.g;
    heatArray[i * 3 + 2] = _heatColor.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(heatArray, 3));
  geometry.attributes.color.needsUpdate = true;
}

/**
 * Computes how many vertices are influenced by each bone and average weight.
 */
export function computeBoneInfluenceStats(
  geometry: THREE.BufferGeometry,
  boneCount: number,
): { counts: number[]; averages: number[] } {
  const counts = new Array(boneCount).fill(0);
  const sums = new Array(boneCount).fill(0);

  const skinIndexAttr = geometry.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const skinWeightAttr = geometry.attributes.skinWeight as THREE.BufferAttribute | undefined;
  if (!skinIndexAttr || !skinWeightAttr) {
    return { counts, averages: sums };
  }

  const vCount = skinIndexAttr.count;
  for (let i = 0; i < vCount; i++) {
    for (let k = 0; k < 4; k++) {
      const b = Math.round(skinIndexAttr.getComponent(i, k));
      const w = skinWeightAttr.getComponent(i, k);
      if (b >= 0 && b < boneCount && w > 0.05) {
        counts[b]++;
        sums[b] += w;
      }
    }
  }

  const averages = sums.map((s, idx) => (counts[idx] > 0 ? s / counts[idx] : 0));
  return { counts, averages };
}
