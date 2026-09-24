// Additional builders: pine tree, rock, water grid.

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Low-poly pine tree: tapered cylinder trunk + two stacked cones. Vertex colors baked.
export function buildTree() {
  const p = [], n = [], c = [];
  const idx = [];
  const trunkColor = [0.32, 0.21, 0.12];
  const leafColor = [0.16, 0.38, 0.14];

  function addCone(radius, yBase, height, sides, color, capColor) {
    const apex = [0, yBase + height, 0];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      const base = p.length / 3;
      p.push(x0, yBase, z0, x1, yBase, z1, apex[0], apex[1], apex[2]);
      const e1 = [x1 - x0, 0, z1 - z0];
      const e2 = [apex[0] - x0, height, apex[2] - z0];
      // outward face normal = e2 x e1
      const fn = normalize3([
        e2[1] * e1[2] - e2[2] * e1[1],
        e2[2] * e1[0] - e2[0] * e1[2],
        e2[0] * e1[1] - e2[1] * e1[0],
      ]);
      for (let k = 0; k < 3; k++) n.push(fn[0], fn[1], fn[2]);
      const shade = 0.9 + ((i * 37) % 10) / 50; // per-face variation
      for (let k = 0; k < 3; k++) c.push(color[0] * shade, color[1] * shade, color[2] * shade);
      idx.push(base, base + 2, base + 1); // CCW outward
      if (capColor) {
        const b2 = p.length / 3;
        p.push(0, yBase, 0, x1, yBase, z1, x0, yBase, z0);
        for (let k = 0; k < 3; k++) { n.push(0, -1, 0); c.push(capColor[0], capColor[1], capColor[2]); }
        idx.push(b2, b2 + 2, b2 + 1); // face down
      }
    }
  }

  addCone(0.14, 0.0, 1.2, 6, trunkColor, trunkColor);   // trunk
  addCone(0.85, 0.7, 1.6, 7, leafColor, null);          // lower foliage
  addCone(0.6, 1.6, 1.5, 7, leafColor, null);           // upper foliage

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    colors: new Float32Array(c),
    indices: new Uint16Array(idx),
  };
}

// Deformed icosahedron rock, flat shaded, gray tones.
export function buildRock(seed = 7) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(v => normalize3(v));
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  verts = verts.map(v => {
    const k = 0.35 + rnd() * 0.35;
    return [v[0] * k, v[1] * k * (0.7 + rnd() * 0.3), v[2] * k];
  });
  const p = [], n = [], c = [], idx = [];
  for (const f of faces) {
    const base = p.length / 3;
    const [a, b, d] = f;
    const va = verts[a], vb = verts[b], vd = verts[d];
    const e1 = [vb[0] - va[0], vb[1] - va[1], vb[2] - va[2]];
    const e2 = [vd[0] - va[0], vd[1] - va[1], vd[2] - va[2]];
    let fn = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const cx = (va[0] + vb[0] + vd[0]) / 3, cy = (va[1] + vb[1] + vd[1]) / 3, cz = (va[2] + vb[2] + vd[2]) / 3;
    let flip = fn[0] * cx + fn[1] * cy + fn[2] * cz < 0;
    if (flip) fn = fn.map(x => -x);
    fn = normalize3(fn);
    p.push(...va, ...vb, ...vd);
    for (let k = 0; k < 3; k++) n.push(fn[0], fn[1], fn[2]);
    const shade = 0.32 + rnd() * 0.15;
    for (let k = 0; k < 3; k++) c.push(shade, shade * 1.02, shade * 1.05);
    if (flip) idx.push(base, base + 2, base + 1);
    else idx.push(base, base + 1, base + 2);
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    colors: new Float32Array(c),
    indices: new Uint16Array(idx),
  };
}

// Subdivided XZ grid for the water surface (waves in vertex shader).
export function buildGrid(size = 600, divisions = 96) {
  const p = [], n = [], idx = [];
  const half = size / 2;
  for (let z = 0; z <= divisions; z++) {
    for (let x = 0; x <= divisions; x++) {
      p.push(-half + (x / divisions) * size, 0, -half + (z / divisions) * size);
      n.push(0, 1, 0);
    }
  }
  for (let z = 0; z < divisions; z++) {
    for (let x = 0; x < divisions; x++) {
      const a = z * (divisions + 1) + x;
      const b = a + divisions + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    indices: new Uint32Array(idx),
  };
}
