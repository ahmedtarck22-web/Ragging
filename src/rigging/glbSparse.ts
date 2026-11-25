/**
 * Converts dense morph target accessors in a GLB ArrayBuffer into standard glTF 2.0
 * sparse accessors so static models with facial blendshapes export at ~1/3 the file size.
 */
export function optimizeGlbSparseMorphs(glbBuffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(glbBuffer);
  const view = new DataView(glbBuffer);
  if (bytes.byteLength < 28) return glbBuffer;

  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) return glbBuffer; // 'glTF'

  const jsonLen = view.getUint32(12, true);
  const jsonStart = 20;
  const binHeaderPos = jsonStart + jsonLen;
  if (binHeaderPos + 8 > bytes.byteLength) return glbBuffer;

  const jsonText = new TextDecoder().decode(bytes.subarray(jsonStart, jsonStart + jsonLen));
  const json = JSON.parse(jsonText) as {
    meshes?: Array<{ primitives?: Array<{ targets?: Array<Record<string, number>> }> }>;
    accessors?: Array<{
      bufferView?: number;
      byteOffset?: number;
      count: number;
      sparse?: unknown;
    }>;
    bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
    buffers?: Array<{ byteLength: number }>;
    images?: Array<{ bufferView?: number }>;
  };

  if (!json.meshes || !json.accessors || !json.bufferViews || !json.buffers?.[0]) {
    return glbBuffer;
  }

  const morphAccSet = new Set<number>();
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives ?? []) {
      for (const tgt of prim.targets ?? []) {
        for (const accIdx of Object.values(tgt)) {
          const acc = json.accessors[accIdx];
          if (acc && acc.bufferView !== undefined && !acc.sparse) {
            morphAccSet.add(accIdx);
          }
        }
      }
    }
  }
  if (morphAccSet.size === 0) return glbBuffer;

  // Only drop a bufferView if ALL accessors referencing it are morph accessors
  const nonMorphBvs = new Set<number>();
  for (let i = 0; i < json.accessors.length; i++) {
    if (morphAccSet.has(i)) continue;
    const bv = json.accessors[i].bufferView;
    if (bv !== undefined) nonMorphBvs.add(bv);
  }
  for (const img of json.images ?? []) {
    if (img.bufferView !== undefined) nonMorphBvs.add(img.bufferView);
  }

  const dropBvSet = new Set<number>();
  for (const accIdx of morphAccSet) {
    const bvIdx = json.accessors[accIdx].bufferView!;
    if (!nonMorphBvs.has(bvIdx)) dropBvSet.add(bvIdx);
  }

  const binLen = view.getUint32(binHeaderPos, true);
  const binStart = binHeaderPos + 8;
  const oldBin = bytes.subarray(binStart, binStart + binLen);
  const oldBinView = new DataView(glbBuffer, binStart, binLen);

  const pad4 = (n: number) => (4 - (n % 4)) % 4;
  const chunks: Uint8Array[] = [];
  let cursor = 0;
  const newBvMap = new Map<number, number>();
  const newBvs: Array<{ buffer: number; byteOffset: number; byteLength: number; byteStride?: number }> = [];

  for (let i = 0; i < json.bufferViews.length; i++) {
    if (dropBvSet.has(i)) continue;
    const bv = json.bufferViews[i];
    const off = bv.byteOffset ?? 0;
    const slice = oldBin.subarray(off, off + bv.byteLength);
    const p = pad4(cursor);
    if (p) {
      chunks.push(new Uint8Array(p));
      cursor += p;
    }
    newBvMap.set(i, newBvs.length);
    newBvs.push({ ...bv, byteOffset: cursor });
    chunks.push(slice);
    cursor += slice.length;
  }

  for (let i = 0; i < json.accessors.length; i++) {
    if (morphAccSet.has(i)) continue;
    const acc = json.accessors[i];
    if (acc.bufferView !== undefined) {
      acc.bufferView = newBvMap.get(acc.bufferView);
    }
  }
  for (const img of json.images ?? []) {
    if (img.bufferView !== undefined) {
      img.bufferView = newBvMap.get(img.bufferView);
    }
  }

  for (const accIdx of morphAccSet) {
    const acc = json.accessors[accIdx];
    const bv = json.bufferViews[acc.bufferView!];
    const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = bv.byteStride ?? 12;
    const count = acc.count;

    const nonZero: Array<[number, number, number, number]> = [];
    for (let v = 0; v < count; v++) {
      const o = baseOff + v * stride;
      const x = oldBinView.getFloat32(o, true);
      const y = oldBinView.getFloat32(o + 4, true);
      const z = oldBinView.getFloat32(o + 8, true);
      if (Math.abs(x) > 1e-6 || Math.abs(y) > 1e-6 || Math.abs(z) > 1e-6) {
        nonZero.push([v, x, y, z]);
      }
    }

    const nzCount = nonZero.length;
    const idxBuf = new Uint8Array(nzCount * 4);
    const valBuf = new Uint8Array(nzCount * 12);
    const idxView = new DataView(idxBuf.buffer);
    const valView = new DataView(valBuf.buffer);
    for (let j = 0; j < nzCount; j++) {
      const [vi, x, y, z] = nonZero[j];
      idxView.setUint32(j * 4, vi, true);
      valView.setFloat32(j * 12, x, true);
      valView.setFloat32(j * 12 + 4, y, true);
      valView.setFloat32(j * 12 + 8, z, true);
    }

    const pIdx = pad4(cursor);
    if (pIdx) {
      chunks.push(new Uint8Array(pIdx));
      cursor += pIdx;
    }
    const idxBvIdx = newBvs.length;
    newBvs.push({ buffer: 0, byteOffset: cursor, byteLength: idxBuf.byteLength });
    chunks.push(idxBuf);
    cursor += idxBuf.byteLength;

    const pVal = pad4(cursor);
    if (pVal) {
      chunks.push(new Uint8Array(pVal));
      cursor += pVal;
    }
    const valBvIdx = newBvs.length;
    newBvs.push({ buffer: 0, byteOffset: cursor, byteLength: valBuf.byteLength });
    chunks.push(valBuf);
    cursor += valBuf.byteLength;

    delete acc.bufferView;
    delete acc.byteOffset;
    acc.sparse = {
      count: nzCount,
      indices: { bufferView: idxBvIdx, byteOffset: 0, componentType: 5125 },
      values: { bufferView: valBvIdx, byteOffset: 0 },
    };
  }

  const pEnd = pad4(cursor);
  if (pEnd) {
    chunks.push(new Uint8Array(pEnd));
    cursor += pEnd;
  }

  json.bufferViews = newBvs;
  json.buffers[0].byteLength = cursor;

  const rawJson = new TextEncoder().encode(JSON.stringify(json));
  const jPad = pad4(rawJson.byteLength);
  const paddedJsonLen = rawJson.byteLength + jPad;
  const totalGlbLen = 12 + 8 + paddedJsonLen + 8 + cursor;

  const out = new Uint8Array(totalGlbLen);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, totalGlbLen, true);
  outView.setUint32(12, paddedJsonLen, true);
  outView.setUint32(16, 0x4e4f534a, true);
  out.set(rawJson, 20);
  for (let i = 0; i < jPad; i++) out[20 + rawJson.byteLength + i] = 0x20;

  const outBinPos = 20 + paddedJsonLen;
  outView.setUint32(outBinPos, cursor, true);
  outView.setUint32(outBinPos + 4, 0x004e4942, true);
  let writeOff = outBinPos + 8;
  for (const ch of chunks) {
    out.set(ch, writeOff);
    writeOff += ch.byteLength;
  }

  return out.buffer;
}
