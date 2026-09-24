// WebGL2 shader program wrapper with uniform/attrib introspection.

export class ShaderProgram {
  constructor(gl, vsSource, fsSource, name = 'shader') {
    this.gl = gl;
    this.name = name;
    const vs = this.compile(gl.VERTEX_SHADER, vsSource, name + '.vert');
    const fs = this.compile(gl.FRAGMENT_SHADER, fsSource, name + '.frag');
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error(`Shader link failed (${name}):\n${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = prog;
    this.uniforms = new Map();
    this.attribs = new Map();
    const nU = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nU; i++) {
      const info = gl.getActiveUniform(prog, i);
      const uname = info.name.replace(/\[0\]$/, '');
      this.uniforms.set(uname, gl.getUniformLocation(prog, info.name));
    }
    const nA = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < nA; i++) {
      const info = gl.getActiveAttrib(prog, i);
      this.attribs.set(info.name, gl.getAttribLocation(prog, info.name));
    }
  }

  compile(type, source, name) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      throw new Error(`Shader compile failed (${name}):\n${log}`);
    }
    return sh;
  }

  use() {
    this.gl.useProgram(this.program);
  }

  u(name) { return this.uniforms.get(name); }
  a(name) { return this.attribs.get(name); }

  setMat4(name, mat) {
    const loc = this.uniforms.get(name);
    if (loc !== undefined) this.gl.uniformMatrix4fv(loc, false, mat);
  }

  setVec3(name, x, y, z) {
    const loc = this.uniforms.get(name);
    if (loc !== undefined) this.gl.uniform3f(loc, x, y, z);
  }

  setVec4(name, x, y, z, w) {
    const loc = this.uniforms.get(name);
    if (loc !== undefined) this.gl.uniform4f(loc, x, y, z, w);
  }

  setFloat(name, v) {
    const loc = this.uniforms.get(name);
    if (loc !== undefined) this.gl.uniform1f(loc, v);
  }

  setInt(name, v) {
    const loc = this.uniforms.get(name);
    if (loc !== undefined) this.gl.uniform1i(loc, v);
  }
}
