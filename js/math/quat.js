// Quaternion library. Layout: [x, y, z, w].

export function create(x = 0, y = 0, z = 0, w = 1) {
  return new Float32Array([x, y, z, w]);
}

export function identity(out) {
  out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
  return out;
}

export function copy(out, a) {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
  return out;
}

export function clone(a) {
  return new Float32Array([a[0], a[1], a[2], a[3]]);
}

export function normalize(out, a) {
  const len = Math.hypot(a[0], a[1], a[2], a[3]);
  if (len > 1e-10) {
    const inv = 1 / len;
    out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv; out[3] = a[3] * inv;
  } else {
    identity(out);
  }
  return out;
}

// out = a * b  (apply b first, then a)
export function multiply(out, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = ax * bw + aw * bx + ay * bz - az * by;
  out[1] = ay * bw + aw * by + az * bx - ax * bz;
  out[2] = az * bw + aw * bz + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function setAxisAngle(out, axis, rad) {
  rad *= 0.5;
  const s = Math.sin(rad);
  out[0] = axis[0] * s; out[1] = axis[1] * s; out[2] = axis[2] * s;
  out[3] = Math.cos(rad);
  return out;
}

// Integrate orientation by angular velocity (rad/s) over dt seconds.
export function integrateAngularVelocity(out, q, wx, wy, wz, dt) {
  const half = 0.5 * dt;
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  // dq = 0.5 * omega_quat * q
  const dx = half * (wx * qw + wy * qz - wz * qy);
  const dy = half * (wy * qw + wz * qx - wx * qz);
  const dz = half * (wz * qw + wx * qy - wy * qx);
  const dw = half * (-wx * qx - wy * qy - wz * qz);
  out[0] = qx + dx; out[1] = qy + dy; out[2] = qz + dz; out[3] = qw + dw;
  return normalize(out, out);
}

export function conjugate(out, a) {
  out[0] = -a[0]; out[1] = -a[1]; out[2] = -a[2]; out[3] = a[3];
  return out;
}

// Write rotation matrix (column-major mat4, no translation) from quaternion.
export function toMat4(out, q) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0;
  out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0;
  out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

// Build a quaternion from a rotation matrix (3x3 portion of column-major mat4).
export function fromMat3(out, m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    out[3] = 0.25 / s;
    out[0] = (m21 - m12) * s;
    out[1] = (m02 - m20) * s;
    out[2] = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    out[3] = (m21 - m12) / s;
    out[0] = 0.25 * s;
    out[1] = (m01 + m10) / s;
    out[2] = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    out[3] = (m02 - m20) / s;
    out[0] = (m01 + m10) / s;
    out[1] = 0.25 * s;
    out[2] = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    out[3] = (m10 - m01) / s;
    out[0] = (m02 + m20) / s;
    out[1] = (m12 + m21) / s;
    out[2] = 0.25 * s;
  }
  return normalize(out, out);
}
