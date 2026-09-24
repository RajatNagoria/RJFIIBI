// Procedural mesh builders: unit cube, UV sphere, low-poly tree, rock, water grid.

export function buildCube() {
  // 24 vertices (per-face normals), unit cube centered at origin
  const p = [], n = [], idx = [];
  const faces = [
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  ];
  for (const [normal, corners] of faces) {
    const base = p.length / 3;
    for (const c of corners) {
      p.push(c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      n.push(normal[0], normal[1], normal[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    indices: new Uint16Array(idx),
  };
}

export function buildSphere(segments = 24, rings = 16) {
  const p = [], n = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const st = Math.sin(theta), ct = Math.cos(theta);
      const x = sp * ct, y = cp, z = sp * st;
      p.push(x * 0.5, y * 0.5, z * 0.5);
      n.push(x, y, z);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    indices: new Uint16Array(idx),
  };
}

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
