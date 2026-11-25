import * as THREE from 'three';
import { StaticBipedLandmarks } from './autoRigStaticModel';
import { QualityPreset } from './types';

export interface MeshProfileReport {
  vertexCount: number;
  triangleCount: number;
  boneCount: number;
  morphTargetCount: number;
  textureCount: number;
  webpSupported: boolean;
  qualityPreset: QualityPreset;
}

let cachedWebpSupported: boolean | null = null;

export function detectWebpSupport(): boolean {
  if (cachedWebpSupported !== null) return cachedWebpSupported;
  if (typeof document === 'undefined') {
    cachedWebpSupported = true;
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext) {
      cachedWebpSupported = false;
      return false;
    }
    const dataUrl = canvas.toDataURL('image/webp');
    cachedWebpSupported = dataUrl.startsWith('data:image/webp');
    return cachedWebpSupported;
  } catch {
    cachedWebpSupported = false;
    return false;
  }
}

/**
 * Region-aware spatial vertex clustering decimation for large indexed meshes (e.g. 486k verts).
 * Keeps fine resolution on the face/mouth/eyes while decimating body/limbs for Medium & Low LODs.
 */
export function decimateGeometryForQuality(
  geom: THREE.BufferGeometry,
  quality: QualityPreset,
  lm?: StaticBipedLandmarks,
): THREE.BufferGeometry {
  if (quality === 'high') return geom;

  const posAttr = geom.attributes.position as THREE.BufferAttribute | undefined;
  const normAttr = geom.attributes.normal as THREE.BufferAttribute | undefined;
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute | undefined;
  const colAttr = geom.attributes.color as THREE.BufferAttribute | undefined;
  const indexAttr = geom.index;
  if (!posAttr || !indexAttr || posAttr.count < 8000) return geom;

  const bodyCell = quality === 'medium' ? 0.0085 : 0.0175;
  const faceCell = quality === 'medium' ? 0.0032 : 0.0058;

  const count = posAttr.count;
  const clusterMap = new Map<string, number>();
  const oldToNew = new Int32Array(count);

  const accPos: number[] = [];
  const accNorm: number[] = [];
  const accUv: number[] = [];
  const accCol: number[] = [];
  const accCount: number[] = [];

  const faceMinY = lm ? lm.chinY - 0.015 : 1.32;
  const faceMaxY = lm ? lm.browY + 0.045 : 1.72;
  const faceMinZ = lm ? lm.mouthZ - 0.08 : 0.05;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const isFaceZone =
      y >= faceMinY && y <= faceMaxY && z >= faceMinZ && Math.abs(x) < 0.14;
    const cell = isFaceZone ? faceCell : bodyCell;

    const gx = Math.round(x / cell);
    const gy = Math.round(y / cell);
    const gz = Math.round(z / cell);
    // Prefix face vs body so boundary verts don't collapse across face seam awkwardly
    const key = `${isFaceZone ? 'F' : 'B'}:${gx},${gy},${gz}`;

    let clusterIdx = clusterMap.get(key);
    if (clusterIdx === undefined) {
      clusterIdx = accCount.length;
      clusterMap.set(key, clusterIdx);
      accPos.push(0, 0, 0);
      accNorm.push(0, 0, 0);
      accUv.push(0, 0);
      if (colAttr) accCol.push(0, 0, 0);
      accCount.push(0);
    }

    oldToNew[i] = clusterIdx;
    const base3 = clusterIdx * 3;
    const base2 = clusterIdx * 2;
    accPos[base3] += x;
    accPos[base3 + 1] += y;
    accPos[base3 + 2] += z;
    if (normAttr) {
      accNorm[base3] += normAttr.getX(i);
      accNorm[base3 + 1] += normAttr.getY(i);
      accNorm[base3 + 2] += normAttr.getZ(i);
    }
    if (uvAttr) {
      accUv[base2] += uvAttr.getX(i);
      accUv[base2 + 1] += uvAttr.getY(i);
    }
    if (colAttr) {
      accCol[base3] += colAttr.getX(i);
      accCol[base3 + 1] += colAttr.getY(i);
      accCol[base3 + 2] += colAttr.getZ(i);
    }
    accCount[clusterIdx] += 1;
  }

  const newVertCount = accCount.length;
  const newPos = new Float32Array(newVertCount * 3);
  const newNorm = new Float32Array(newVertCount * 3);
  const newUv = new Float32Array(newVertCount * 2);
  const newCol = colAttr ? new Float32Array(newVertCount * 3) : null;

  for (let c = 0; c < newVertCount; c++) {
    const n = accCount[c] || 1;
    const b3 = c * 3;
    const b2 = c * 2;
    newPos[b3] = accPos[b3] / n;
    newPos[b3 + 1] = accPos[b3 + 1] / n;
    newPos[b3 + 2] = accPos[b3 + 2] / n;

    if (normAttr) {
      const nx = accNorm[b3];
      const ny = accNorm[b3 + 1];
      const nz = accNorm[b3 + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      newNorm[b3] = nx / len;
      newNorm[b3 + 1] = ny / len;
      newNorm[b3 + 2] = nz / len;
    }

    if (uvAttr) {
      newUv[b2] = accUv[b2] / n;
      newUv[b2 + 1] = accUv[b2 + 1] / n;
    }

    if (newCol) {
      newCol[b3] = accCol[b3] / n;
      newCol[b3 + 1] = accCol[b3 + 1] / n;
      newCol[b3 + 2] = accCol[b3 + 2] / n;
    }
  }

  const idxCount = indexAttr.count;
  const rawIndices = new Uint32Array(idxCount);
  let outIdxLen = 0;
  for (let t = 0; t + 2 < idxCount; t += 3) {
    const a = oldToNew[indexAttr.getX(t)];
    const b = oldToNew[indexAttr.getX(t + 1)];
    const c = oldToNew[indexAttr.getX(t + 2)];
    if (a !== b && b !== c && a !== c) {
      rawIndices[outIdxLen++] = a;
      rawIndices[outIdxLen++] = b;
      rawIndices[outIdxLen++] = c;
    }
  }

  const outGeom = new THREE.BufferGeometry();
  outGeom.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  outGeom.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
  outGeom.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));
  if (newCol) {
    outGeom.setAttribute('color', new THREE.BufferAttribute(newCol, 3));
  }

  const finalIdx = rawIndices.subarray(0, outIdxLen);
  outGeom.setIndex(
    newVertCount <= 65535
      ? new THREE.BufferAttribute(new Uint16Array(finalIdx), 1)
      : new THREE.BufferAttribute(new Uint32Array(finalIdx), 1),
  );
  if (!normAttr) {
    outGeom.computeVertexNormals();
  }
  return outGeom;
}

/**
 * Downscales large textures in-place on cloned materials for Low quality preset
 * to minimize VRAM footprint on weaker devices.
 */
export function optimizeMaterialsForQuality(
  mats: THREE.Material[],
  quality: QualityPreset,
): void {
  if (quality === 'high' || typeof document === 'undefined') return;
  const maxDim = quality === 'medium' ? 1024 : 512;

  for (const mat of mats) {
    const std = mat as THREE.MeshStandardMaterial;
    const texSlots: Array<keyof THREE.MeshStandardMaterial> = [
      'map',
      'roughnessMap',
      'metalnessMap',
      'normalMap',
    ];
    for (const slot of texSlots) {
      const tex = std[slot] as THREE.Texture | null | undefined;
      if (!tex || !tex.image) continue;
      const img = tex.image as { width?: number; height?: number };
      const w = img.width ?? 0;
      const h = img.height ?? 0;
      if (w <= maxDim && h <= maxDim) continue;
      if (w === 0 || h === 0) continue;

      try {
        const scale = Math.min(maxDim / w, maxDim / h);
        const targetW = Math.max(64, Math.round(w * scale));
        const targetH = Math.max(64, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(tex.image as CanvasImageSource, 0, 0, targetW, targetH);
        const scaledTex = new THREE.CanvasTexture(canvas);
        scaledTex.colorSpace = tex.colorSpace;
        scaledTex.flipY = tex.flipY;
        scaledTex.wrapS = tex.wrapS;
        scaledTex.wrapT = tex.wrapT;
        scaledTex.needsUpdate = true;
        tex.dispose();
        (std as unknown as Record<string, unknown>)[slot] = scaledTex;
        std.needsUpdate = true;
      } catch {
        // Keep original texture if canvas draw fails
      }
    }
  }
}

export function applyRendererQualitySettings(
  renderer: THREE.WebGLRenderer,
  keyLight: THREE.DirectionalLight,
  quality: QualityPreset,
  isSoftwareGl: boolean,
): void {
  if (isSoftwareGl) {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    keyLight.castShadow = false;
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  if (quality === 'low') {
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    keyLight.castShadow = false;
  } else if (quality === 'medium') {
    renderer.setPixelRatio(Math.min(dpr, 1.35));
    renderer.shadowMap.enabled = true;
    keyLight.castShadow = true;
  } else {
    renderer.setPixelRatio(Math.min(dpr, 2));
    renderer.shadowMap.enabled = true;
    keyLight.castShadow = true;
  }
}

export function analyzeAssetProfile(
  allMeshes: THREE.Mesh[],
  boneCount: number,
  morphTargetCount: number,
  qualityPreset: QualityPreset,
): MeshProfileReport {
  let vertexCount = 0;
  let triangleCount = 0;
  const texSet = new Set<string>();

  for (const m of allMeshes) {
    const p = m.geometry.attributes.position;
    const idx = m.geometry.index;
    if (p) vertexCount += p.count;
    if (idx) triangleCount += idx.count / 3;
    else if (p) triangleCount += p.count / 3;

    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) {
      const std = mt as THREE.MeshStandardMaterial;
      if (std.map) texSet.add(std.map.uuid);
      if (std.roughnessMap) texSet.add(std.roughnessMap.uuid);
      if (std.normalMap) texSet.add(std.normalMap.uuid);
    }
  }

  return {
    vertexCount,
    triangleCount: Math.round(triangleCount),
    boneCount,
    morphTargetCount,
    textureCount: texSet.size,
    webpSupported: detectWebpSupport(),
    qualityPreset,
  };
}
