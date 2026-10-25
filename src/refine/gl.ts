/* WebGL2 renderer (SPEC §6 "WebGL2 (port)"): the 128² block buffer is an RGBA8 NEAREST texture updated with
   texSubImage2D (dirty rows only) and drawn as one fullscreen quad; pops, butter edges and sparkles are ONE
   instanced rect draw from a preallocated Float32Array ([x, y, w, h, r, g, b, a, outline]); the sharp image is a
   LINEAR texture mixed by uSharpA; the reduced-motion snapshot is a blitFramebuffer copy of the last frame.
   preserveDrawingBuffer keeps the last frame for that copy (and for tests reading pixels back). */
import { BUTTER, BUTTER_HI, EDGE, SPARK_COLS, type Refiner, type Renderer } from './engine'

const VS_Q = `#version 300 es
in vec2 p; out vec2 uv; uniform float uFlip;
void main(){ uv = vec2(p.x*.5+.5, uFlip > .5 ? p.y*.5+.5 : .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`
const FS_Q = `#version 300 es
precision mediump float; in vec2 uv; uniform sampler2D uT; uniform float uA; out vec4 o;
void main(){ o = vec4(texture(uT, uv).rgb, uA); }`
const VS_R = `#version 300 es
in vec2 p; in vec4 aR; in vec4 aC; in float aL; uniform float uS;
out vec4 vC; out vec2 vP; out vec2 vWH; flat out float vL;
void main(){ vec2 q = aR.xy + p*aR.zw; vP = p*aR.zw; vWH = aR.zw; vC = aC; vL = aL;
  gl_Position = vec4(q.x/uS*2.-1., 1.-q.y/uS*2., 0., 1.); }`
const FS_R = `#version 300 es
precision mediump float; in vec4 vC; in vec2 vP; in vec2 vWH; flat in float vL; out vec4 o;
void main(){ if (vL > 0. && vP.x >= vL && vP.y >= vL && vP.x <= vWH.x-vL && vP.y <= vWH.y-vL) discard; o = vC; }`

const hex = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const C_BUT = hex(BUTTER), C_HI = hex(BUTTER_HI), C_EDGE = hex(EDGE), C_SP = SPARK_COLS.map(hex)
const MAXI = 4096, STRIDE = 9

function prog(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh)); gl.attachShader(p, sh) }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); return p
}

export class RGL implements Renderer {
  readonly kind = 'webgl2' as const
  gl: WebGL2RenderingContext; pq: WebGLProgram; pr: WebGLProgram; vq: WebGLVertexArrayObject; vr: WebGLVertexArrayObject; ib: WebGLBuffer
  tBlocks: WebGLTexture; tSharp: WebGLTexture; tSnap: WebGLTexture; fSnap: WebGLFramebuffer
  inst = new Float32Array(MAXI * STRIDE); n = 0; T = 0; S = 0; hasSharp = false; lost = false
  u: Record<string, WebGLUniformLocation | null> = {}
  constructor(public cv: HTMLCanvasElement) {
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('no webgl2'); this.gl = gl
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true })
    this.pq = prog(gl, VS_Q, FS_Q); this.pr = prog(gl, VS_R, FS_R)
    for (const [k, p] of [['qT', this.pq], ['qA', this.pq], ['qFlip', this.pq], ['rS', this.pr]] as const) this.u[k] = gl.getUniformLocation(p, k === 'qT' ? 'uT' : k === 'qA' ? 'uA' : k === 'qFlip' ? 'uFlip' : 'uS')
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.vq = gl.createVertexArray()!; gl.bindVertexArray(this.vq); let l = gl.getAttribLocation(this.pq, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0)
    const unit = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, unit); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this.vr = gl.createVertexArray()!; gl.bindVertexArray(this.vr); l = gl.getAttribLocation(this.pr, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0)
    this.ib = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.ib); gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW)
    const at = (name: string, size: number, offs: number) => { const a = gl.getAttribLocation(this.pr, name); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, STRIDE * 4, offs * 4); gl.vertexAttribDivisor(a, 1) }
    at('aR', 4, 0); at('aC', 4, 4); at('aL', 1, 8); gl.bindVertexArray(null)
    const tex = (f: number) => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t }
    this.tBlocks = tex(gl.NEAREST); this.tSharp = tex(gl.LINEAR); this.tSnap = tex(gl.NEAREST); this.fSnap = gl.createFramebuffer()!
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
  }
  resize(S: number) {
    const gl = this.gl; this.S = S; this.cv.width = this.cv.height = S; gl.viewport(0, 0, S, S)
    gl.bindTexture(gl.TEXTURE_2D, this.tSnap); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fSnap); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tSnap, 0)
    gl.clearColor(30 / 255, 22 / 255, 64 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  setSharp(img: CanvasImageSource | null) {
    const gl = this.gl; this.hasSharp = !!img; if (!img) return
    gl.bindTexture(gl.TEXTURE_2D, this.tSharp); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img as TexImageSource)
  }
  takeSnap() { const gl = this.gl, S = this.S; gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fSnap); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, S, S, 0, 0, S, S, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, null) }
  private quad(t: WebGLTexture, a: number, flip: boolean) {
    const gl = this.gl; gl.useProgram(this.pq); gl.bindVertexArray(this.vq); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t)
    gl.uniform1i(this.u.qT, 0); gl.uniform1f(this.u.qA, a); gl.uniform1f(this.u.qFlip, flip ? 1 : 0)
    if (a < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA) } else gl.disable(gl.BLEND)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  private rect(x: number, y: number, w: number, h: number, c: number[], a: number, line: number) {
    if (this.n >= MAXI) return; const o = this.n++ * STRIDE, f = this.inst
    f[o] = x; f[o + 1] = y; f[o + 2] = w; f[o + 3] = h; f[o + 4] = c[0]; f[o + 5] = c[1]; f[o + 6] = c[2]; f[o + 7] = a; f[o + 8] = line
  }
  private flush() {
    if (!this.n) return; const gl = this.gl
    gl.useProgram(this.pr); gl.bindVertexArray(this.vr); gl.uniform1f(this.u.rS, this.S)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, this.n * STRIDE)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n); this.n = 0
  }
  private cc = [0, 0, 0]
  draw(R: Refiner, now: number, sharpA: number, snapA: number) {
    const gl = this.gl; if (this.lost || gl.isContextLost()) return
    const T = R.T
    gl.bindTexture(gl.TEXTURE_2D, this.tBlocks)
    if (T !== this.T) { this.T = T; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, T, T, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); R.dirty = true; R.dy0 = 0; R.dy1 = T }
    if (R.dirty) { const u8 = new Uint8Array(R.buf.buffer, R.dy0 * T * 4, (R.dy1 - R.dy0) * T * 4); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, R.dy0, T, R.dy1 - R.dy0, gl.RGBA, gl.UNSIGNED_BYTE, u8); R.dirty = false }
    this.quad(this.tBlocks, 1, false)
    if (R.popLen) {
      R.prunePops(now); const cc = this.cc, col = R.tree!.col32
      for (let q = 0; q < R.popLen; q++) R.pop(q, now, (cid, x, y, s) => { if (R.popK >= 1) return; const c = col[cid]; cc[0] = (c & 255) / 255; cc[1] = (c >>> 8 & 255) / 255; cc[2] = (c >>> 16 & 255) / 255; this.rect(x, y, s, s, cc, 1, 0) })
      for (let q = 0; q < R.popLen; q++) R.pop(q, now, (_c, x, y, s) => { if (R.popE > 0) this.rect(x, y, s, s, R.popStrong ? C_HI : C_BUT, R.popE, R.popStrong ? R.lw * 2 : R.lw) })
      this.flush()
    }
    if (sharpA > 0 && this.hasSharp) this.quad(this.tSharp, sharpA, false)
    if (snapA > 0) this.quad(this.tSnap, snapA, true)
    R.sparks(now, (p, x, y, w, h) => this.rect(x, y, w, h, p === 0 ? C_EDGE : C_SP[p - 1], 1, 0)); this.flush()
  }
  dispose() {}
  lose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext() }
}

/** probe once on a throwaway canvas, so a failing shader never leaves the real canvas stuck with a dead context */
let probed: boolean | null = null
export function glOK() {
  if (probed !== null) return probed
  try { const c = document.createElement('canvas'); c.width = c.height = 4; const r = new RGL(c); r.lose(); probed = true } catch { probed = false }
  return probed
}
