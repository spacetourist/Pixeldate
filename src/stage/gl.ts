/* WebGL2 de-pixelation renderer (lazy chunk). PRIVACY: it only ever samples the photo the peer already sent for the
   current level (`blocks` px wide), so it can never show more than the receiver is allowed: uBlocks is clamped to the
   texture width in the shader. One full-screen triangle, NEAREST cell-centre sampling, LINEAR only for the final
   crossfade at the full-photo level (where the texture is the allowed full photo). */
const VS = `#version 300 es
void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);gl_Position=vec4(p,0.,1.);}`
const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex,uRaw,uPrev;uniform float uS,uBlocks,uFront,uClarity,uPrevMix,uDpr;out vec4 o;
vec3 cellAt(sampler2D t,vec2 uv,float b){return texture(t,(floor(uv*b)+.5)/b).rgb;}
void main(){
 vec2 uv=vec2(gl_FragCoord.x,uS-gl_FragCoord.y)/uS;
 float n=float(textureSize(uTex,0).x),b=min(uBlocks,n);
 vec3 c=cellAt(uTex,uv,b);
 if(uPrevMix>0.){float pn=float(textureSize(uPrev,0).x);c=mix(c,cellAt(uPrev,uv,pn),uPrevMix);}
 float raw=n>200.?clamp((b-200.)/(n-200.),0.,1.):0.;
 if(raw>0.)c=mix(c,texture(uRaw,uv).rgb,raw);
 // block bevel: softens as the meter fills (uClarity), gone once blocks are tiny
 float cp=uS/b,w=clamp(2.*uDpr/cp,0.,.2),e=(1.-uClarity)*.07*(1.-raw)*step(3.*uDpr,cp);
 vec2 q=fract(uv*b);c+=e*(step(q.x,w)+step(q.y,w))-e*(step(1.-w,q.x)+step(1.-w,q.y));
 // diagonal front (level-up): a stepped butter streak, top-left to bottom-right, on cell coordinates
 if(uFront>-1.){vec2 cc=(floor(uv*b)+.5)/b;float d=(cc.x+cc.y)*.5,k=1.-smoothstep(0.,1.6/b+.02,abs(d-uFront));c=mix(c,vec3(1.,.902,.541),.55*k);}
 o=vec4(clamp(c,0.,1.),1.);
}`
export interface U { blocks: number; front: number; clar: number; prevMix: number }
export interface R { setTex(img: TexImageSource, keepPrev: boolean): void; draw(u: U): void; size(px: number, dpr: number): void; destroy(): void }

export function createGL(cv: HTMLCanvasElement, onLost: () => void): R | null {
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' })
  if (!gl) return null
  const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); return x }
  const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null
  gl.useProgram(p); gl.bindVertexArray(gl.createVertexArray())
  const L = (n: string) => gl.getUniformLocation(p, n)
  const uS = L('uS'), uB = L('uBlocks'), uF = L('uFront'), uC = L('uClarity'), uP = L('uPrevMix'), uD = L('uDpr')
  gl.uniform1i(L('uTex'), 0); gl.uniform1i(L('uRaw'), 1); gl.uniform1i(L('uPrev'), 2)
  const samp = (f: number) => { const s = gl.createSampler()!; for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, f], [gl.TEXTURE_MAG_FILTER, f], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.samplerParameteri(s, k, v); return s }
  const near = samp(gl.NEAREST), lin = samp(gl.LINEAR)
  gl.bindSampler(0, near); gl.bindSampler(1, lin); gl.bindSampler(2, near)
  const mk = () => gl.createTexture()!
  let cur = mk(), prev = mk(), S = 1, dpr = 1
  const blank = (t: WebGLTexture) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([12, 7, 34, 255])) }
  blank(cur); blank(prev)
  const lost = (e: Event) => { e.preventDefault(); onLost() }
  cv.addEventListener('webglcontextlost', lost)
  return {
    setTex(img, keepPrev) {
      if (keepPrev) { const t = prev; prev = cur; cur = t } // keep the old one as prev, upload into the freed slot
      gl.bindTexture(gl.TEXTURE_2D, cur); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    },
    size(px, d) { S = px; dpr = d; if (cv.width !== px) { cv.width = px; cv.height = px } gl.viewport(0, 0, px, px) },
    draw(u) {
      gl.uniform1f(uS, S); gl.uniform1f(uD, dpr); gl.uniform1f(uB, u.blocks); gl.uniform1f(uF, u.front); gl.uniform1f(uC, u.clar); gl.uniform1f(uP, u.prevMix)
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, prev)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cur)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    destroy() { cv.removeEventListener('webglcontextlost', lost); gl.getExtension('WEBGL_lose_context')?.loseContext() },
  }
}
