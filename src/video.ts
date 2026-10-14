import { LEVELS, REVEAL_MS } from './config'
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`
const FS = `precision highp float; uniform sampler2D t; uniform float n; uniform float tr; uniform float asp; varying vec2 v;
vec3 bc(vec2 uv, float k){ vec2 g = vec2(k, k*asp); vec2 c = (floor(uv*g)+.5)/g; vec2 o = .25/g;
  return (texture2D(t,c+vec2(-o.x,-o.y)).rgb+texture2D(t,c+vec2(o.x,-o.y)).rgb+texture2D(t,c+vec2(-o.x,o.y)).rgb+texture2D(t,c+o).rgb)*.25; }
void main(){ if (n <= 0.) { gl_FragColor = vec4(texture2D(t,v).rgb,1.); return; }
  vec3 a = bc(v,n); if (tr <= 0.) { gl_FragColor = vec4(a,1.); return; }
  vec3 b = bc(v,2.*n); float d = (v.x + v.y*.35)/1.35; float p = clamp((tr*1.3-d)/.3,0.,1.);
  vec3 col = p > .5 ? b : a; col = mix(col, vec3(1.,.94,.925), .4*sin(3.14159*p)); gl_FragColor = vec4(col,1.); }`
/** Pixelates the camera on the SENDER. The canvas itself is only blocks*4 px wide below level 5,
 *  so canvas.captureStream() can never carry more detail than the level. */
export class PixelCam {
  canvas = document.createElement('canvas'); video = document.createElement('video')
  private gl: WebGLRenderingContext; private u: Record<string, WebGLUniformLocation | null> = {}
  private level = 1; private tr = 0; private raf = 0; stream: MediaStream; out: MediaStream
  constructor(cam: MediaStream) {
    this.stream = cam; this.video.srcObject = cam; this.video.muted = true; this.video.playsInline = true; this.video.play()
    const gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true })!; this.gl = gl
    const sh = (ty: number, s: string) => { const o = gl.createShader(ty)!; gl.shaderSource(o, s); gl.compileShader(o); return o }
    const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const l = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0)
    for (const k of ['n', 'tr', 'asp']) this.u[k] = gl.getUniformLocation(pr, k)
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
    this.resize(); this.out = this.canvas.captureStream(24)
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop) }; loop()
    // keep drawing when rAF is throttled (background tab)
    setInterval(() => { if (document.hidden) this.draw() }, 100)
  }
  private resize() {
    const b = LEVELS[this.level - 1].blocks, w = b ? b * 4 * (this.tr > 0 ? 2 : 1) : 480
    this.canvas.width = w; this.canvas.height = Math.round(w * 3 / 4); this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
  }
  setLevel(level: number) {
    const up = level === this.level + 1 && level < 5
    if (up) { const t0 = performance.now(); this.tr = 0.001; this.resize()
      const a = () => { this.tr = Math.min(1, (performance.now() - t0) / REVEAL_MS); if (this.tr < 1) requestAnimationFrame(a); else { this.tr = 0; this.level = level; this.resize() } }; a()
    } else { this.level = level; this.tr = 0; this.resize() }
  }
  private draw() {
    const gl = this.gl, v = this.video; if (v.readyState < 2) return
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v)
    gl.uniform1f(this.u.n, LEVELS[this.level - 1].blocks); gl.uniform1f(this.u.tr, this.tr); gl.uniform1f(this.u.asp, 3 / 4)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  stop() { cancelAnimationFrame(this.raf); this.stream.getTracks().forEach(t => t.stop()); this.out.getTracks().forEach(t => t.stop()) }
}
