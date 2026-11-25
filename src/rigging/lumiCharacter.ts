import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Prepares a BufferGeometry for merging with smooth Gouraud/Phong normals:
 * - Preserves/creates vertex indexing so computeVertexNormals() averages shared faces smoothly
 * - Strips extraneous attributes and assigns smooth vertex colors
 */
function preparePart(
  geom: THREE.BufferGeometry,
  colorHex: string,
  matrix?: THREE.Matrix4,
  smoothWeld = false,
): THREE.BufferGeometry {
  let g = geom.clone();
  if (matrix) g.applyMatrix4(matrix);

  if (smoothWeld) {
    // Weld coincident vertices (helpful on ExtrudeGeometry curves) before computing normals
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position') g.deleteAttribute(key);
    }
    g = mergeVertices(g, 1e-4);
  }

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

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cr = Math.min(r, hw * 0.9, hh * 0.9);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return shape;
}

function createBeveledPanel(
  width: number,
  height: number,
  depth: number,
  cornerRadius: number,
  bevelSize: number,
  colorHex: string,
  matrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  const innerW = Math.max(0.004, width - bevelSize * 2);
  const innerH = Math.max(0.004, height - bevelSize * 2);
  const innerD = Math.max(0.002, depth - bevelSize * 2);
  const shape = createRoundedRectShape(innerW, innerH, cornerRadius);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerD,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 5,
    curveSegments: 16,
  });
  geo.center();
  return preparePart(geo, colorHex, matrix, true);
}

function createLimbPart(
  start: [number, number, number],
  end: [number, number, number],
  rStart: number,
  rEnd: number,
  colorHex: string,
  heightSegments = 12,
): THREE.BufferGeometry {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const cyl = new THREE.CylinderGeometry(rEnd, rStart, len, 24, heightSegments, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  return preparePart(cyl, colorHex, m);
}

function createTubeStroke(
  points: [number, number, number][],
  radius: number,
  colorHex: string,
  tubularSegments = 20,
  radialSegments = 12,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const tube = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  return preparePart(tube, colorHex);
}

/**
 * Creates a smooth beveled "TOUR GUIDE" chest ID badge with a golden pyramid emblem,
 * matching the Tour Guide boy character design. Attached cleanly to the Chest bone.
 */
export function createTourGuideBadgeMesh(): THREE.Mesh {
  const w = 256;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f5f1e6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c8b48c';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);

  // Dark backdrop behind pyramid
  ctx.fillStyle = '#2a3548';
  ctx.fillRect(46, 36, w - 92, 108);

  // Golden pyramid emblem
  ctx.fillStyle = '#d4a656';
  ctx.beginPath();
  ctx.moveTo(w / 2, 46);
  ctx.lineTo(w / 2 + 52, 134);
  ctx.lineTo(w / 2 - 52, 134);
  ctx.closePath();
  ctx.fill();

  // Subtle horizontal brick lines on pyramid
  ctx.strokeStyle = '#8b6528';
  ctx.lineWidth = 4;
  for (const frac of [0.38, 0.58, 0.78]) {
    const py = 46 + (134 - 46) * frac;
    const hw = 52 * frac;
    ctx.beginPath();
    ctx.moveTo(w / 2 - hw + 2, py);
    ctx.lineTo(w / 2 + hw - 2, py);
    ctx.stroke();
  }

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOUR', w / 2, 208);
  ctx.fillText('GUIDE', w / 2, 258);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const geo = new THREE.BoxGeometry(0.102, 0.128, 0.01);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0.05,
  });
  const badge = new THREE.Mesh(geo, mat);
  badge.name = 'TourGuideBadge';
  badge.position.set(0, 0.01, 0.132);
  badge.rotation.x = -0.04;
  badge.castShadow = true;
  return badge;
}

/**
 * Smooth Pixar-Cartoon 3D Boy Tour Guide Character matching the uploaded image:
 * smooth lavender-purple skin, fluffy curly purple hair, beige curved safari hat
 * with taupe band & golden pyramid emblem, round gold glasses, expressive violet eyes
 * with curved eyelids/lashes & brows, sculpted lipsync mouth + teeth, light cream
 * collared shirt with rolled sleeves, khaki utility vest, dark lanyard + Tour Guide badge,
 * brown leather backpack, wristwatch on right wrist, tan cargo pants, smooth brown
 * lace-up hiking boots, and 10 articulated fingers.
 */
export function buildLumiTourGuideGeometry(
  attachMorphsFn: (geom: THREE.BufferGeometry, tags: Uint8Array) => void,
): {
  geometry: THREE.BufferGeometry;
  morphTargetNames: string[];
  vertexTags: Uint8Array;
} {
  const parts: THREE.BufferGeometry[] = [];
  const partTags: number[] = [];

  const pushPart = (geom: THREE.BufferGeometry, tag = 0) => {
    parts.push(geom);
    partTags.push(tag);
  };

  // Accurate Palette matching the uploaded Tour Guide Boy photo
  const skin = '#946cd4';
  const skinShade = '#7d56bd';
  const lipColor = '#7d53bd';
  const mouthDark = '#2d0d24';
  const teethWhite = '#f4f0ec';
  const tonguePink = '#c95c7c';
  const hairPurple = '#53198f';
  const hairHighlight = '#6e28b5';
  const hairDeep = '#3b0e6b';
  const hatBeige = '#d5c6a7';
  const hatBrim = '#c4b391';
  const hatBand = '#655444';
  const gold = '#d4a656';
  const pyramidLine = '#8f692a';
  const shirtCream = '#e4d7be';
  const vestKhaki = '#c7b38b';
  const vestTrim = '#b29b72';
  const pantKhaki = '#c4ae87';
  const pantShadow = '#ac966f';
  const backpackBrown = '#5e402e';
  const backpackDark = '#462e20';
  const beltBrown = '#4b3224';
  const buckleSilver = '#8c94a0';
  const lanyardNavy = '#2a3548';
  const bootBrown = '#694229';
  const bootDark = '#3a2316';
  const eyeWhite = '#f7f8fc';
  const irisViolet = '#3e1b69';
  const pupilDark = '#110622';
  const lashDark = '#1e0b36';

  // --- PELVIS, BELT & BUCKLE ---
  const pelvisProfile = [
    new THREE.Vector2(0.01, -0.1),
    new THREE.Vector2(0.145, -0.07),
    new THREE.Vector2(0.15, 0.03),
    new THREE.Vector2(0.135, 0.09),
    new THREE.Vector2(0.01, 0.095),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(pelvisProfile, 32),
      pantKhaki,
      makeTransform(0, 0.96, 0, 0, 0, 0, 1.06, 1, 0.84),
    ),
  );

  // Smooth belt loop around waist
  pushPart(
    preparePart(
      new THREE.TorusGeometry(0.132, 0.02, 16, 36),
      beltBrown,
      makeTransform(0, 1.045, 0, Math.PI / 2, 0, 0, 1.08, 0.88, 1.1),
    ),
  );
  // Beveled metallic buckle
  pushPart(
    createBeveledPanel(
      0.06,
      0.048,
      0.022,
      0.008,
      0.005,
      buckleSilver,
      makeTransform(0, 1.045, 0.12),
    ),
  );
  pushPart(
    createBeveledPanel(
      0.032,
      0.028,
      0.025,
      0.004,
      0.003,
      beltBrown,
      makeTransform(0, 1.045, 0.121),
    ),
  );

  // --- SHIRT TORSO & COLLAR ---
  pushPart(createLimbPart([0, 1.05, 0], [0, 1.5, 0], 0.125, 0.135, shirtCream, 14));
  // Smooth front button placket
  pushPart(
    createBeveledPanel(
      0.03,
      0.34,
      0.024,
      0.006,
      0.004,
      shirtCream,
      makeTransform(0, 1.28, 0.115),
    ),
  );

  // --- KHAKI UTILITY VEST (Lathe sculpted open front) ---
  const vestProfile = [
    new THREE.Vector2(0.01, -0.15),
    new THREE.Vector2(0.152, -0.13),
    new THREE.Vector2(0.184, 0.02),
    new THREE.Vector2(0.168, 0.14),
    new THREE.Vector2(0.088, 0.18),
    new THREE.Vector2(0.01, 0.18),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(vestProfile, 36),
      vestKhaki,
      makeTransform(0, 1.355, -0.004, 0, 0, 0, 1.04, 1.0, 0.8),
    ),
  );

  for (const side of [1, -1]) {
    // Shirt collar lapels (smooth beveled curves)
    pushPart(
      createBeveledPanel(
        0.066,
        0.082,
        0.026,
        0.016,
        0.006,
        shirtCream,
        makeTransform(side * 0.056, 1.498, 0.086, 0.28, side * 0.22, side * -0.42),
      ),
    );
    // Vest front panels
    pushPart(
      createBeveledPanel(
        0.105,
        0.37,
        0.04,
        0.018,
        0.008,
        vestKhaki,
        makeTransform(side * 0.082, 1.28, 0.102, 0.02, side * -0.18, 0),
      ),
    );
    // Upper chest utility pocket + flap
    pushPart(
      createBeveledPanel(
        0.068,
        0.072,
        0.026,
        0.012,
        0.006,
        vestTrim,
        makeTransform(side * 0.086, 1.365, 0.125, 0, side * -0.18, 0),
      ),
    );
    pushPart(
      createBeveledPanel(
        0.072,
        0.024,
        0.03,
        0.007,
        0.005,
        vestKhaki,
        makeTransform(side * 0.086, 1.396, 0.128, 0, side * -0.18, 0),
      ),
    );
    // Lower waist cargo vest pocket + flap
    pushPart(
      createBeveledPanel(
        0.078,
        0.082,
        0.028,
        0.014,
        0.006,
        vestTrim,
        makeTransform(side * 0.088, 1.18, 0.124, 0, side * -0.18, 0),
      ),
    );
    pushPart(
      createBeveledPanel(
        0.082,
        0.026,
        0.032,
        0.007,
        0.005,
        vestKhaki,
        makeTransform(side * 0.088, 1.216, 0.128, 0, side * -0.18, 0),
      ),
    );

    // Smooth curved brown leather backpack straps over shoulders
    pushPart(
      createTubeStroke(
        [
          [side * 0.095, 1.15, -0.13],
          [side * 0.105, 1.35, -0.11],
          [side * 0.1, 1.52, -0.02],
          [side * 0.105, 1.46, 0.095],
          [side * 0.108, 1.26, 0.11],
          [side * 0.115, 1.13, 0.04],
        ],
        0.018,
        backpackBrown,
        24,
        12,
      ),
    );
    // Strap buckle on front
    pushPart(
      createBeveledPanel(
        0.042,
        0.028,
        0.018,
        0.005,
        0.004,
        buckleSilver,
        makeTransform(side * 0.105, 1.35, 0.106, 0, side * -0.16, 0),
      ),
    );
  }

  // --- SMOOTH BEVELED BROWN LEATHER BACKPACK ---
  pushPart(
    createBeveledPanel(
      0.24,
      0.3,
      0.135,
      0.048,
      0.022,
      backpackBrown,
      makeTransform(0, 1.335, -0.168),
    ),
  );
  // Top rounded flap
  pushPart(
    createBeveledPanel(
      0.23,
      0.1,
      0.145,
      0.04,
      0.018,
      backpackDark,
      makeTransform(0, 1.435, -0.17, -0.1, 0, 0),
    ),
  );
  // Lower rear pouch
  pushPart(
    createBeveledPanel(
      0.19,
      0.125,
      0.055,
      0.032,
      0.014,
      backpackDark,
      makeTransform(0, 1.25, -0.232),
    ),
  );
  // Side pockets on backpack
  for (const side of [1, -1]) {
    pushPart(
      createBeveledPanel(
        0.045,
        0.13,
        0.08,
        0.018,
        0.01,
        backpackDark,
        makeTransform(side * 0.132, 1.26, -0.165),
      ),
    );
  }

  // --- SMOOTH NAVY LANYARD STRAP ---
  pushPart(
    createTubeStroke(
      [
        [0.064, 1.535, 0.038],
        [0.046, 1.44, 0.095],
        [0, 1.34, 0.128],
        [-0.046, 1.44, 0.095],
        [-0.064, 1.535, 0.038],
      ],
      0.009,
      lanyardNavy,
      24,
      10,
    ),
  );

  // --- NECK ---
  pushPart(createLimbPart([0, 1.51, 0], [0, 1.655, 0], 0.052, 0.046, skin, 10));

  // --- STYLIZED PIXAR-CARTOON HEAD & FACE (tag 10 = head rigid lock) ---
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.132, 36, 28),
      skin,
      makeTransform(0, 1.775, 0.005, 0, 0, 0, 0.96, 1.02, 0.98),
    ),
    10,
  );
  // Soft rounded cheeks
  for (const side of [1, -1]) {
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.056, 20, 16),
        skin,
        makeTransform(side * 0.064, 1.734, 0.072),
      ),
      10,
    );
  }

  // --- ARTICULATED LOWER JAW / CHIN (tag 1) ---
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.072, 24, 18),
      skin,
      makeTransform(0, 1.682, 0.035, 0.12, 0, 0, 0.9, 0.72, 0.9),
    ),
    1,
  );

  // Smooth rounded mouth cavity (nested cleanly behind lips, NOT a protruding box)
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.034, 20, 14),
      mouthDark,
      makeTransform(0, 1.703, 0.096, 0, 0, 0, 1.08, 0.45, 0.55),
    ),
    10,
  );
  // Subtle upper teeth arch inside cavity
  pushPart(
    preparePart(
      new THREE.CylinderGeometry(0.025, 0.025, 0.008, 18, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
      teethWhite,
      makeTransform(0, 1.708, 0.092),
    ),
    10,
  );
  // Subtle tongue tucked inside jaw
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.02, 14, 10),
      tonguePink,
      makeTransform(0, 1.694, 0.095, 0, 0, 0, 1.15, 0.45, 0.8),
    ),
    1,
  );

  // Smooth curved smiling lips & corners (tags 2, 1, 3)
  pushPart(
    createTubeStroke(
      [
        [-0.028, 1.708, 0.11],
        [-0.012, 1.712, 0.119],
        [0, 1.711, 0.121],
        [0.012, 1.712, 0.119],
        [0.028, 1.708, 0.11],
      ],
      0.0068,
      lipColor,
      18,
      10,
    ),
    2,
  );
  pushPart(
    createTubeStroke(
      [
        [-0.026, 1.704, 0.11],
        [-0.01, 1.696, 0.117],
        [0, 1.695, 0.118],
        [0.01, 1.696, 0.117],
        [0.026, 1.704, 0.11],
      ],
      0.0072,
      lipColor,
      18,
      10,
    ),
    1,
  );
  for (const side of [1, -1]) {
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.0072, 12, 10),
        lipColor,
        makeTransform(side * 0.028, 1.707, 0.11),
      ),
      3,
    );
  }

  // --- ROUNDED CARTOON NOSE (tag 8) ---
  pushPart(
    preparePart(
      new THREE.SphereGeometry(0.02, 20, 16),
      skinShade,
      makeTransform(0, 1.744, 0.127, 0, 0, 0, 1.08, 0.86, 0.92),
    ),
    8,
  );

  // --- EXPRESSIVE EYES, CURVED EYELIDS/LASHES, ARCHED BROWS, ROUND GOLD GLASSES, EARS ---
  for (const side of [1, -1]) {
    const isLeft = side > 0;
    const ex = side * 0.047;
    const ey = 1.773;
    const ez = 0.102;

    // Eyeball (sclera)
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.025, 22, 18),
        eyeWhite,
        makeTransform(ex, ey, ez, 0, 0, 0, 1.0, 1.06, 0.95),
      ),
      10,
    );
    // Large deep-violet iris
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.0165, 20, 16),
        irisViolet,
        makeTransform(ex, ey, ez + 0.015),
      ),
      10,
    );
    // Pupil
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.0095, 16, 14),
        pupilDark,
        makeTransform(ex, ey, ez + 0.024),
      ),
      10,
    );
    // Crisp white upper-right catchlight + tiny lower secondary glint
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.0042, 10, 10),
        eyeWhite,
        makeTransform(ex + 0.0065, ey + 0.007, ez + 0.03),
      ),
      10,
    );
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.002, 8, 8),
        eyeWhite,
        makeTransform(ex - 0.005, ey - 0.005, ez + 0.03),
      ),
      10,
    );

    // Smooth curved spherical-shell upper eyelid (NO box!) (tag 6 left, 7 right)
    pushPart(
      preparePart(
        new THREE.SphereGeometry(
          0.0272,
          20,
          12,
          -Math.PI * 0.88,
          Math.PI * 0.76,
          Math.PI * 0.12,
          Math.PI * 0.34,
        ),
        skinShade,
        makeTransform(ex, ey + 0.002, ez, -0.18, Math.PI * 0.5, 0),
      ),
      isLeft ? 6 : 7,
    );

    // Graceful curved upper eyelash arch (tag 6 left, 7 right)
    pushPart(
      createTubeStroke(
        [
          [ex - 0.022 * side, ey + 0.008, ez + 0.018],
          [ex - 0.008 * side, ey + 0.02, ez + 0.024],
          [ex + 0.008 * side, ey + 0.02, ez + 0.024],
          [ex + 0.023 * side, ey + 0.01, ez + 0.017],
        ],
        0.0036,
        lashDark,
        14,
        8,
      ),
      isLeft ? 6 : 7,
    );

    // Soft arched purple eyebrow (tag 4 left, 5 right)
    pushPart(
      createTubeStroke(
        [
          [ex - 0.02 * side, 1.81, 0.114],
          [ex, 1.819, 0.118],
          [ex + 0.022 * side, 1.811, 0.11],
        ],
        0.0068,
        hairPurple,
        14,
        10,
      ),
      isLeft ? 4 : 5,
    );

    // Thin round gold wire glasses rim
    pushPart(
      preparePart(
        new THREE.TorusGeometry(0.036, 0.0032, 12, 36),
        gold,
        makeTransform(side * 0.048, 1.772, 0.134),
      ),
      10,
    );
    // Temple arm curving neatly back over ear
    pushPart(
      createTubeStroke(
        [
          [side * 0.084, 1.774, 0.133],
          [side * 0.106, 1.775, 0.085],
          [side * 0.118, 1.774, 0.01],
          [side * 0.115, 1.762, -0.022],
        ],
        0.0026,
        gold,
        14,
        8,
      ),
      10,
    );

    // Sculpted Ear (tag 9)
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.024, 18, 14),
        skin,
        makeTransform(side * 0.123, 1.758, 0.002, 0, 0, side * -0.14, 0.5, 1.25, 0.72),
      ),
      9,
    );
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.014, 12, 10),
        skinShade,
        makeTransform(side * 0.125, 1.758, 0.005, 0, 0, side * -0.14, 0.35, 0.88, 0.5),
      ),
      9,
    );
  }

  // Curved gold nose bridge for glasses
  pushPart(
    createTubeStroke(
      [
        [-0.012, 1.774, 0.134],
        [0, 1.78, 0.137],
        [0.012, 1.774, 0.134],
      ],
      0.0028,
      gold,
      10,
      8,
    ),
    10,
  );

  // --- FLUFFY CURLY DEEP-PURPLE HAIR UNDER HAT (tag 10) ---
  const curlPositions: Array<[number, number, number, number, string]> = [
    // Forehead curls peeking below brim
    [-0.068, 1.845, 0.095, 0.034, hairPurple],
    [-0.032, 1.855, 0.104, 0.038, hairHighlight],
    [0.01, 1.858, 0.106, 0.038, hairPurple],
    [0.052, 1.85, 0.098, 0.036, hairHighlight],
    [0.085, 1.838, 0.08, 0.036, hairDeep],
    [-0.092, 1.836, 0.078, 0.036, hairDeep],
    // Full fluffy side curls
    [0.128, 1.825, 0.048, 0.044, hairPurple],
    [-0.128, 1.825, 0.048, 0.044, hairPurple],
    [0.146, 1.78, 0.025, 0.042, hairHighlight],
    [-0.146, 1.78, 0.025, 0.042, hairHighlight],
    [0.142, 1.732, 0.02, 0.04, hairPurple],
    [-0.142, 1.732, 0.02, 0.04, hairPurple],
    [0.124, 1.69, -0.005, 0.038, hairDeep],
    [-0.124, 1.69, -0.005, 0.038, hairDeep],
    [0.132, 1.785, -0.045, 0.046, hairPurple],
    [-0.132, 1.785, -0.045, 0.046, hairPurple],
    // Back curls
    [0.088, 1.805, -0.095, 0.052, hairDeep],
    [-0.088, 1.805, -0.095, 0.052, hairDeep],
    [0.0, 1.815, -0.112, 0.056, hairPurple],
    [0.072, 1.735, -0.092, 0.048, hairHighlight],
    [-0.072, 1.735, -0.092, 0.048, hairHighlight],
    [0.0, 1.72, -0.11, 0.05, hairDeep],
    [0.055, 1.675, -0.075, 0.04, hairDeep],
    [-0.055, 1.675, -0.075, 0.04, hairDeep],
  ];
  for (const [cx, cy, cz, cr, col] of curlPositions) {
    pushPart(
      preparePart(new THREE.SphereGeometry(cr, 18, 14), col, makeTransform(cx, cy, cz)),
      10,
    );
  }

  // --- SMOOTH BEIGE SAFARI HAT WITH CURVED BRIM & GOLDEN PYRAMID EMBLEM (tag 10) ---
  // Smooth lathe-sculpted hat brim & crown with rounded lip
  const hatBrimProfile = [
    new THREE.Vector2(0.132, 0.0),
    new THREE.Vector2(0.165, -0.003),
    new THREE.Vector2(0.195, -0.009),
    new THREE.Vector2(0.214, -0.015),
    new THREE.Vector2(0.218, -0.018),
    new THREE.Vector2(0.214, -0.022),
    new THREE.Vector2(0.185, -0.016),
    new THREE.Vector2(0.134, -0.009),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(hatBrimProfile, 44),
      hatBrim,
      makeTransform(0, 1.872, 0.002, -0.06, 0, 0),
    ),
    10,
  );

  // Smooth rounded safari crown
  const crownProfile = [
    new THREE.Vector2(0.142, 0.0),
    new THREE.Vector2(0.138, 0.04),
    new THREE.Vector2(0.125, 0.085),
    new THREE.Vector2(0.092, 0.118),
    new THREE.Vector2(0.045, 0.132),
    new THREE.Vector2(0.0, 0.135),
  ];
  pushPart(
    preparePart(
      new THREE.LatheGeometry(crownProfile, 40),
      hatBeige,
      makeTransform(0, 1.872, 0.002, -0.06, 0, 0, 1.0, 1.0, 1.05),
    ),
    10,
  );

  // Taupe-brown hat band
  pushPart(
    preparePart(
      new THREE.CylinderGeometry(0.139, 0.144, 0.032, 40),
      hatBand,
      makeTransform(0, 1.89, 0.002, -0.06, 0, 0, 1.0, 1.0, 1.05),
    ),
    10,
  );

  // Golden pyramid emblem on hat front
  const pyrShape = new THREE.Shape();
  pyrShape.moveTo(-0.036, -0.026);
  pyrShape.lineTo(0.036, -0.026);
  pyrShape.lineTo(0, 0.032);
  pyrShape.closePath();
  const pyrGeo = new THREE.ExtrudeGeometry(pyrShape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 3,
  });
  pyrGeo.center();
  pushPart(
    preparePart(pyrGeo, gold, makeTransform(0, 1.918, 0.144, -0.18, 0, 0), true),
    10,
  );
  // Horizontal pyramid stone lines across emblem
  for (const [py, pw] of [
    [1.908, 0.046],
    [1.918, 0.034],
    [1.928, 0.02],
  ] as const) {
    pushPart(
      createBeveledPanel(
        pw,
        0.003,
        0.004,
        0.001,
        0.0005,
        pyramidLine,
        makeTransform(0, py, 0.149, -0.18, 0, 0),
      ),
      10,
    );
  }

  // --- ARMS (T-POSE ALIGNED), ROLLED SLEEVES, RIGHT WRISTWATCH, SCULPTED HANDS & 10 FINGERS ---
  for (const side of [1, -1]) {
    // Cream shirt shoulder cap
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.06, 20, 16),
        shirtCream,
        makeTransform(side * 0.21, 1.49, 0),
      ),
    );
    // Rolled shirt sleeve upper arm
    pushPart(createLimbPart([side * 0.21, 1.49, 0], [side * 0.435, 1.49, 0], 0.056, 0.05, shirtCream, 12));
    // Soft folded sleeve cuff roll just above elbow
    pushPart(
      preparePart(
        new THREE.TorusGeometry(0.047, 0.015, 14, 28),
        shirtCream,
        makeTransform(side * 0.432, 1.49, 0, 0, Math.PI / 2, 0),
      ),
    );
    // Smooth lavender forearm & elbow joint
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.04, 18, 14),
        skin,
        makeTransform(side * 0.47, 1.49, 0),
      ),
    );
    pushPart(createLimbPart([side * 0.47, 1.49, 0], [side * 0.71, 1.49, 0], 0.041, 0.031, skin, 12));
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.029, 14, 12),
        skin,
        makeTransform(side * 0.71, 1.49, 0),
      ),
    );

    // Brown leather wristwatch ONLY on Right wrist (side === -1), matching the boy photo
    if (side === -1) {
      pushPart(
        preparePart(
          new THREE.TorusGeometry(0.032, 0.0085, 12, 24),
          beltBrown,
          makeTransform(side * 0.668, 1.49, 0, 0, Math.PI / 2, 0),
        ),
      );
      pushPart(
        preparePart(
          new THREE.CylinderGeometry(0.017, 0.017, 0.008, 20),
          buckleSilver,
          makeTransform(side * 0.668, 1.522, 0.008, 0.25, 0, 0),
        ),
      );
      pushPart(
        preparePart(
          new THREE.CylinderGeometry(0.013, 0.013, 0.009, 18),
          eyeWhite,
          makeTransform(side * 0.668, 1.523, 0.008, 0.25, 0, 0),
        ),
      );
    }

    // Smooth beveled sculpted palm (NO sharp box)
    pushPart(
      createBeveledPanel(
        0.072,
        0.026,
        0.068,
        0.014,
        0.009,
        skin,
        makeTransform(side * 0.746, 1.49, 0),
      ),
    );

    // 5 Articulated Smooth Tapered Fingers per Hand
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
      pushPart(createLimbPart(p0, p1, f.r, f.r * 0.88, skin, 6));
      pushPart(
        preparePart(
          new THREE.SphereGeometry(f.r * 0.88, 10, 8),
          skin,
          makeTransform(p1[0], p1[1], p1[2]),
        ),
      );
      pushPart(createLimbPart(p1, p2, f.r * 0.86, f.r * 0.68, skinShade, 6));
      pushPart(
        preparePart(
          new THREE.SphereGeometry(f.r * 0.68, 10, 8),
          skinShade,
          makeTransform(p2[0], p2[1], p2[2]),
        ),
      );
    }
  }

  // --- KHAKI CARGO PANTS & SCULPTED BROWN LACE-UP HIKING BOOTS ---
  for (const side of [1, -1]) {
    // Rounded hip cap
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.088, 22, 16),
        pantKhaki,
        makeTransform(side * 0.11, 0.9, 0),
      ),
    );
    // Tapered cargo thigh
    pushPart(createLimbPart([side * 0.11, 0.9, 0], [side * 0.11, 0.48, 0], 0.094, 0.075, pantKhaki, 14));
    // Smooth rounded beveled side cargo pocket + flap
    pushPart(
      createBeveledPanel(
        0.044,
        0.135,
        0.105,
        0.018,
        0.01,
        pantShadow,
        makeTransform(side * 0.188, 0.67, 0.005, 0, 0, side * -0.04),
      ),
    );
    pushPart(
      createBeveledPanel(
        0.048,
        0.032,
        0.108,
        0.01,
        0.006,
        pantKhaki,
        makeTransform(side * 0.19, 0.728, 0.005, 0, 0, side * -0.04),
      ),
    );
    // Smooth knee fullness
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.075, 20, 16),
        pantKhaki,
        makeTransform(side * 0.11, 0.48, 0.006),
      ),
    );
    // Lower cargo leg
    pushPart(createLimbPart([side * 0.11, 0.48, 0], [side * 0.11, 0.21, 0], 0.078, 0.068, pantKhaki, 12));
    // Soft folded pant cuff tucked over boot top
    pushPart(
      preparePart(
        new THREE.TorusGeometry(0.064, 0.018, 12, 24),
        pantShadow,
        makeTransform(side * 0.11, 0.215, 0, Math.PI / 2, 0, 0),
      ),
    );

    // Sculpted Brown Hiking Boot Shaft + Padded Collar
    pushPart(createLimbPart([side * 0.11, 0.21, 0], [side * 0.11, 0.07, 0], 0.056, 0.058, bootBrown, 10));
    pushPart(
      preparePart(
        new THREE.TorusGeometry(0.052, 0.015, 12, 24),
        bootDark,
        makeTransform(side * 0.11, 0.212, 0, Math.PI / 2, 0, 0),
      ),
    );

    // Smooth sculpted boot heel & mid-foot + rounded toe cap (NO BoxGeometry!)
    pushPart(
      preparePart(
        new THREE.CapsuleGeometry(0.052, 0.11, 10, 22),
        bootBrown,
        makeTransform(side * 0.11, 0.064, 0.042, Math.PI / 2, 0, 0, 1.05, 1.0, 0.78),
      ),
    );
    // Rounded toe box dome
    pushPart(
      preparePart(
        new THREE.SphereGeometry(0.058, 20, 16),
        bootBrown,
        makeTransform(side * 0.11, 0.058, 0.102, 0, 0, 0, 0.96, 0.72, 1.06),
      ),
    );
    // Rugged sculpted dark sole matching boot silhouette
    pushPart(
      preparePart(
        new THREE.CapsuleGeometry(0.056, 0.12, 10, 22),
        bootDark,
        makeTransform(side * 0.11, 0.018, 0.048, Math.PI / 2, 0, 0, 1.08, 1.0, 0.34),
      ),
    );
    // Boot tongue & subtle laces across ankle front
    pushPart(
      createBeveledPanel(
        0.044,
        0.1,
        0.022,
        0.01,
        0.005,
        bootDark,
        makeTransform(side * 0.11, 0.135, 0.055, -0.35, 0, 0),
      ),
    );
    for (const ly of [0.115, 0.145, 0.175]) {
      pushPart(
        createTubeStroke(
          [
            [side * 0.11 - 0.024, ly, 0.066 - (ly - 0.115) * 0.35],
            [side * 0.11, ly + 0.005, 0.072 - (ly - 0.115) * 0.35],
            [side * 0.11 + 0.024, ly, 0.066 - (ly - 0.115) * 0.35],
          ],
          0.0038,
          beltBrown,
          8,
          6,
        ),
      );
    }
  }

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

  attachMorphsFn(merged, vertexTags);
  const morphTargetNames = (merged.userData.morphTargetNames as string[]) ?? [];

  return { geometry: merged, morphTargetNames, vertexTags };
}
