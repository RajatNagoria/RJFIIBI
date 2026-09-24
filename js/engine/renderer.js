import * as mat4 from '../math/mat4.js';
import { ShaderProgram } from './shader.js';
import {
  LIT_VS, LIT_FS, INST_VS, INST_FS,
  DEPTH_VS, DEPTH_INST_VS, DEPTH_FS,
  SKY_VS, SKY_FS, WATER_VS, WATER_FS,
} from './shaders.js';

const SHADOW_SIZE = 2048;
const SHADOW_EXTENT = 80;   // half-size of orthographic shadow box (meters)
const SHADOW_DIST = 160;    // light distance behind focus point

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.progLit = new ShaderProgram(gl, LIT_VS, LIT_FS, 'lit');
    this.progInst = new ShaderProgram(gl, INST_VS, INST_FS, 'inst');
    this.progDepth = new ShaderProgram(gl, DEPTH_VS, DEPTH_FS, 'depth');
    this.progDepthInst = new ShaderProgram(gl, DEPTH_INST_VS, DEPTH_FS, 'depthInst');
    this.progSky = new ShaderProgram(gl, SKY_VS, SKY_FS, 'sky');
    this.progWater = new ShaderProgram(gl, WATER_VS, WATER_FS, 'water');

    // Shadow map FBO (depth texture)
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
      gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Empty VAO for attribute-less fullscreen sky triangle
    this.skyVAO = gl.createVertexArray();

    // Default value for color attribute (location 2) when a mesh has no color array
    gl.vertexAttrib3f(2, 1, 1, 1);

    this.sunDir = norm3([0.55, 0.62, 0.35]);
    this.sunColor = [1.25, 1.12, 0.92];
    this.fogColor = [0.72, 0.82, 0.92]; // matches sky horizon (linear)
    this.fogDensity = 0.0035;

    this.lightView = mat4.create();
    this.lightProj = mat4.create();
    this.lightVP = mat4.create();

    this.identity = mat4.create();

    this.stats = { drawCalls: 0, triangles: 0 };
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(c.clientWidth * dpr);
    const h = Math.floor(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      return true;
    }
    return false;
  }

  // Orthographic shadow frustum that follows the camera, snapped to texels.
  computeLightMatrix(camera) {
    const focus = [
      camera.position[0] + camera.forward[0] * 40,
      camera.position[1] + camera.forward[1] * 40,
      camera.position[2] + camera.forward[2] * 40,
    ];
    const lightPos = [
      focus[0] + this.sunDir[0] * SHADOW_DIST,
      focus[1] + this.sunDir[1] * SHADOW_DIST,
      focus[2] + this.sunDir[2] * SHADOW_DIST,
    ];
    mat4.lookAt(this.lightView, lightPos, focus, [0, 1, 0]);
    mat4.ortho(this.lightProj, -SHADOW_EXTENT, SHADOW_EXTENT, -SHADOW_EXTENT, SHADOW_EXTENT, 1, 320);
    mat4.multiply(this.lightVP, this.lightProj, this.lightView);

    // Snap to texel grid to avoid shimmering: adjust ortho translation.
    const sx = this.lightVP[12];
    const sy = this.lightVP[13];
    const texelX = (sx * 0.5 + 0.5) * SHADOW_SIZE;
    const texelY = (sy * 0.5 + 0.5) * SHADOW_SIZE;
    const dx = (Math.round(texelX) - texelX) / SHADOW_SIZE * 2;
    const dy = (Math.round(texelY) - texelY) / SHADOW_SIZE * 2;
    this.lightProj[12] += dx;
    this.lightProj[13] += dy;
    mat4.multiply(this.lightVP, this.lightProj, this.lightView);
  }


  render(scene, camera, time) {
    const gl = this.gl;
    this.resize();
    this.computeLightMatrix(camera);
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;

    // ---- Shadow pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    let prog = this.progDepth;
    prog.use();
    prog.setMat4('uLightVP', this.lightVP);
    prog.setMat4('uModel', this.identity);
    scene.terrain.draw(gl);
    this.stats.drawCalls++;

    prog = this.progDepthInst;
    prog.use();
    prog.setMat4('uLightVP', this.lightVP);
    for (const m of scene.instancedShadow) {
      m.drawInstanced(gl);
      this.stats.drawCalls++;
    }

    // ---- Main pass ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.53, 0.67, 0.85, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Sky (attribute-less fullscreen triangle, no depth write)
    gl.depthMask(false);
    prog = this.progSky;
    prog.use();
    prog.setMat4('uInvViewProj', camera.invViewProj);
    prog.setVec3('uSunDir', ...this.sunDir);
    prog.setFloat('uTime', time);
    gl.uniform2f(prog.u('uResolution'), this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    this.stats.drawCalls++;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);

    // Terrain
    prog = this.progLit;
    prog.use();
    this.setCommon(prog, camera);
    prog.setMat4('uModel', this.identity);
    prog.setInt('uShadowMap', 0);
    scene.terrain.draw(gl);
    this.stats.drawCalls++;
    this.stats.triangles += scene.terrain.indexCount / 3;

    // Instanced meshes (bodies, trees, rocks)
    prog = this.progInst;
    prog.use();
    this.setCommon(prog, camera);
    prog.setInt('uShadowMap', 0);
    for (const m of scene.instanced) {
      m.drawInstanced(gl);
      this.stats.drawCalls++;
      this.stats.triangles += (m.indexCount / 3) * m.instanceCount;
    }

    // Water (transparent, drawn last)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    prog = this.progWater;
    prog.use();
    prog.setMat4('uViewProj', camera.viewProj);
    prog.setFloat('uTime', time);
    prog.setFloat('uWaterLevel', scene.waterLevel);
    prog.setVec3('uCamPos', ...camera.position);
    prog.setVec3('uSunDir', ...this.sunDir);
    prog.setVec3('uSunColor', ...this.sunColor);
    prog.setVec3('uFogColor', ...this.fogColor);
    prog.setFloat('uFogDensity', this.fogDensity);
    scene.water.draw(gl);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.stats.drawCalls++;
  }

  setCommon(prog, camera) {
    prog.setMat4('uViewProj', camera.viewProj);
    prog.setMat4('uLightVP', this.lightVP);
    prog.setVec3('uSunDir', ...this.sunDir);
    prog.setVec3('uSunColor', ...this.sunColor);
    prog.setVec3('uCamPos', ...camera.position);
    prog.setVec3('uFogColor', ...this.fogColor);
    prog.setFloat('uFogDensity', this.fogDensity);
    prog.setFloat('uShadowTexel', 1 / SHADOW_SIZE);
    prog.setFloat('uShadowStrength', 0.85);
  }
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
