// Mesh: VAO wrapping interleaved vertex buffers + optional instanced attributes.

export class Mesh {
  /**
   * @param gl WebGL2 context
   * @param spec { positions: Float32Array, normals: Float32Array, colors?: Float32Array, indices?: Uint16Array|Uint32Array }
   */
  constructor(gl, spec) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.buffers = [];
    const pos = spec.positions;
    const nrm = spec.normals;
    const col = spec.colors || null;
    const idx = spec.indices || null;

    // Interleave: pos(3) normal(3) color(3)
    const n = pos.length / 3;
    const stride = col ? 9 : 6;
    const data = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      data[i * stride + 0] = pos[i * 3 + 0];
      data[i * stride + 1] = pos[i * 3 + 1];
      data[i * stride + 2] = pos[i * 3 + 2];
      data[i * stride + 3] = nrm[i * 3 + 0];
      data[i * stride + 4] = nrm[i * 3 + 1];
      data[i * stride + 5] = nrm[i * 3 + 2];
      if (col) {
        data[i * stride + 6] = col[i * 3 + 0];
        data[i * stride + 7] = col[i * 3 + 1];
        data[i * stride + 8] = col[i * 3 + 2];
      }
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.buffers.push(vbo);
    this.vertexStride = stride * 4;
    this.hasVertexColor = !!col;

    // locations 0 = pos, 1 = normal, 2 = color (bound via layout(location=) in shaders)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, this.vertexStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, this.vertexStride, 12);
    if (col) {
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, this.vertexStride, 24);
    }

    if (idx) {
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.buffers.push(ibo);
      this.indexType = idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.indexCount = idx.length;
    } else {
      this.indexType = 0;
      this.indexCount = 0;
    }
    this.vertexCount = n;
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.instanceCount = 0;

    gl.bindVertexArray(null);
  }

  /**
   * Attach an instanced attribute buffer.
   * Layout per instance: mat4 (16 floats) + color (3 floats) + params (3 floats: scaleAnim?, tint, flags)
   * -> 22 floats. Mat4 occupies locations 3..6, color location 7, params location 8.
   */
  initInstances(gl, capacity, dynamic = true) {
    this.gl = gl;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * 22 * 4, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const stride = 22 * 4;
    for (let i = 0; i < 4; i++) {
      const loc = 3 + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 3, gl.FLOAT, false, stride, 64);
    gl.vertexAttribDivisor(7, 1);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 3, gl.FLOAT, false, stride, 76);
    gl.vertexAttribDivisor(8, 1);
    gl.bindVertexArray(null);
    this.instanceBuffer = buf;
    this.instanceCapacity = capacity;
    this.instanceCount = 0;
  }

  uploadInstances(gl, data, count) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 22);
    this.instanceCount = count;
  }

  draw(gl) {
    gl.bindVertexArray(this.vao);
    if (this.indexCount > 0) {
      gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    gl.bindVertexArray(null);
  }

  drawInstanced(gl) {
    if (this.instanceCount === 0) return;
    gl.bindVertexArray(this.vao);
    if (this.indexCount > 0) {
      gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, this.indexType, 0, this.instanceCount);
    } else {
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, this.instanceCount);
    }
    gl.bindVertexArray(null);
  }
}
