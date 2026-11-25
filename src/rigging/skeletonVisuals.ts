import * as THREE from 'three';

export interface BoneVisualHandle {
  bone: THREE.Bone;
  boneIndex: number;
  jointMesh: THREE.Mesh;
  linkMesh: THREE.Mesh | null;
  childBone: THREE.Bone | null;
}

export class SkeletonVisualManager {
  public readonly group = new THREE.Group();
  public readonly raycastTargets: THREE.Mesh[] = [];
  private handles: BoneVisualHandle[] = [];
  private jointGeo: THREE.SphereGeometry;
  private boneGeo: THREE.BufferGeometry;

  private matDefaultJoint: THREE.MeshBasicMaterial;
  private matSelectedJoint: THREE.MeshBasicMaterial;
  private matMirrorJoint: THREE.MeshBasicMaterial;

  private matDefaultBone: THREE.MeshBasicMaterial;
  private matSelectedBone: THREE.MeshBasicMaterial;
  private matMirrorBone: THREE.MeshBasicMaterial;

  private _posA = new THREE.Vector3();
  private _posB = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);
  private _quat = new THREE.Quaternion();

  constructor() {
    this.group.name = '__LumiSkeletonVisuals__';
    this.jointGeo = new THREE.SphereGeometry(0.036, 14, 10);
    this.boneGeo = this.createOctahedralBoneGeometry();

    this.matDefaultJoint = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      depthTest: false,
      transparent: true,
      opacity: 0.92,
    });
    this.matSelectedJoint = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
      transparent: true,
      opacity: 1.0,
    });
    this.matMirrorJoint = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });

    this.matDefaultBone = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      depthTest: false,
      transparent: true,
      opacity: 0.55,
      wireframe: false,
    });
    this.matSelectedBone = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      depthTest: false,
      transparent: true,
      opacity: 0.78,
    });
    this.matMirrorBone = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      depthTest: false,
      transparent: true,
      opacity: 0.65,
    });
  }

  /**
   * Builds a unit-height (0..1 on +Y) tapered octahedral bone prism.
   */
  private createOctahedralBoneGeometry(): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const w = 0.14;
    const mid = 0.22;
    const pTop = [0, 1, 0];
    const pBot = [0, 0, 0];
    const r0 = [w, mid, 0];
    const r1 = [0, mid, w];
    const r2 = [-w, mid, 0];
    const r3 = [0, mid, -w];

    const positions = new Float32Array([
      // Bottom pyramid (4 faces)
      ...pBot, ...r1, ...r0,
      ...pBot, ...r2, ...r1,
      ...pBot, ...r3, ...r2,
      ...pBot, ...r0, ...r3,
      // Top pyramid (4 faces)
      ...pTop, ...r0, ...r1,
      ...pTop, ...r1, ...r2,
      ...pTop, ...r2, ...r3,
      ...pTop, ...r3, ...r0,
    ]);

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
  }

  public setBones(bones: THREE.Bone[]): void {
    this.clear();

    bones.forEach((bone, boneIndex) => {
      const jointMesh = new THREE.Mesh(this.jointGeo, this.matDefaultJoint);
      jointMesh.renderOrder = 999;
      jointMesh.userData.boneIndex = boneIndex;
      jointMesh.userData.boneName = bone.name;

      const childBone = bone.children.find((c): c is THREE.Bone => (c as THREE.Bone).isBone) ?? null;
      let linkMesh: THREE.Mesh | null = null;

      if (childBone) {
        linkMesh = new THREE.Mesh(this.boneGeo, this.matDefaultBone);
        linkMesh.renderOrder = 998;
        linkMesh.userData.boneIndex = boneIndex;
        linkMesh.userData.boneName = bone.name;
        this.group.add(linkMesh);
        this.raycastTargets.push(linkMesh);
      }

      this.group.add(jointMesh);
      this.raycastTargets.push(jointMesh);

      this.handles.push({
        bone,
        boneIndex,
        jointMesh,
        linkMesh,
        childBone,
      });
    });

    this.sync();
  }

  public setXRay(xray: boolean): void {
    const mats = [
      this.matDefaultJoint,
      this.matSelectedJoint,
      this.matMirrorJoint,
      this.matDefaultBone,
      this.matSelectedBone,
      this.matMirrorBone,
    ];
    for (const m of mats) {
      m.depthTest = !xray;
      m.needsUpdate = true;
    }
  }

  public highlight(selectedIndex: number, mirrorIndex: number | null): void {
    for (const h of this.handles) {
      const isSelected = h.boneIndex === selectedIndex;
      const isMirror = mirrorIndex !== null && h.boneIndex === mirrorIndex;

      h.jointMesh.material = isSelected
        ? this.matSelectedJoint
        : isMirror
          ? this.matMirrorJoint
          : this.matDefaultJoint;

      h.jointMesh.scale.setScalar(isSelected ? 1.32 : isMirror ? 1.15 : 1.0);

      if (h.linkMesh) {
        h.linkMesh.material = isSelected
          ? this.matSelectedBone
          : isMirror
            ? this.matMirrorBone
            : this.matDefaultBone;
      }
    }
  }

  public sync(): void {
    if (this.handles.length === 0) return;
    this.handles[0].bone.updateMatrixWorld(true);

    for (const h of this.handles) {
      h.bone.getWorldPosition(this._posA);
      h.jointMesh.position.copy(this._posA);

      if (h.linkMesh && h.childBone) {
        h.childBone.getWorldPosition(this._posB);
        this._dir.subVectors(this._posB, this._posA);
        const len = this._dir.length();
        if (len > 1e-4) {
          h.linkMesh.visible = true;
          h.linkMesh.position.copy(this._posA);
          this._dir.normalize();
          this._quat.setFromUnitVectors(this._up, this._dir);
          h.linkMesh.quaternion.copy(this._quat);
          h.linkMesh.scale.set(len, len, len);
        } else {
          h.linkMesh.visible = false;
        }
      }
    }
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.handles = [];
    this.raycastTargets.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.jointGeo.dispose();
    this.boneGeo.dispose();
    this.matDefaultJoint.dispose();
    this.matSelectedJoint.dispose();
    this.matMirrorJoint.dispose();
    this.matDefaultBone.dispose();
    this.matSelectedBone.dispose();
    this.matMirrorBone.dispose();
  }
}
