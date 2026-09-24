import * as mat4 from '../math/mat4.js';

// First-person style camera driven by yaw/pitch.
export class Camera {
  constructor(fovDeg = 70, near = 0.1, far = 600) {
    this.position = new Float32Array([0, 5, 0]);
    this.yaw = 0;         // radians around +Y, 0 = looking down -Z
    this.pitch = 0;       // radians, clamped
    this.fov = (fovDeg * Math.PI) / 180;
    this.near = near;
    this.far = far;
    this.view = mat4.create();
    this.proj = mat4.create();
    this.viewProj = mat4.create();
    this.invViewProj = mat4.create();
    this.forward = new Float32Array([0, 0, -1]);
    this.right = new Float32Array([1, 0, 0]);
    this.up = new Float32Array([0, 1, 0]);
  }

  update(aspect) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // yaw=0 looks down -Z
    this.forward[0] = -sy * cp;
    this.forward[1] = sp;
    this.forward[2] = -cy * cp;
    // right = forward x worldUp, normalized
    const rx = this.forward[2] * -1, rz = this.forward[0];
    const rl = Math.hypot(rx, rz) || 1;
    this.right[0] = rx / rl; this.right[1] = 0; this.right[2] = rz / rl;
    // up = right x forward
    this.up[0] = this.right[1] * this.forward[2] - this.right[2] * this.forward[1];
    this.up[1] = this.right[2] * this.forward[0] - this.right[0] * this.forward[2];
    this.up[2] = this.right[0] * this.forward[1] - this.right[1] * this.forward[0];

    const target = [
      this.position[0] + this.forward[0],
      this.position[1] + this.forward[1],
      this.position[2] + this.forward[2],
    ];
    mat4.lookAt(this.view, this.position, target, [0, 1, 0]);
    mat4.perspective(this.proj, this.fov, aspect, this.near, this.far);
    mat4.multiply(this.viewProj, this.proj, this.view);
    mat4.invert(this.invViewProj, this.viewProj);
  }
}
