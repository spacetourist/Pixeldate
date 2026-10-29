// Minimal PNG reader for the test fixtures (8-bit RGBA or RGB, non-interlaced, palette too) → {w, h, data: RGBA}
import { inflateSync } from 'node:zlib'
export function readPng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, depth = 0, pal = null, trns = null; const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); p += 12 + len
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced') }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break
  }
  if (depth !== 8) throw new Error('depth ' + depth)
  const bpp = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[ct], raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = y && x >= bpp ? px[o - stride + x - bpp] : 0
      let v = src[x]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[o + x] = v & 255
    }
  }
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    if (ct === 6) data.set(px.subarray(i * 4, i * 4 + 4), i * 4)
    else if (ct === 2) { data.set(px.subarray(i * 3, i * 3 + 3), i * 4); data[i * 4 + 3] = 255 }
    else if (ct === 3) { const k = px[i]; data.set(pal.subarray(k * 3, k * 3 + 3), i * 4); data[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255 }
    else if (ct === 0) { data.fill(px[i], i * 4, i * 4 + 3); data[i * 4 + 3] = 255 }
    else { data.fill(px[i * 2], i * 4, i * 4 + 3); data[i * 4 + 3] = px[i * 2 + 1] }
  }
  return { w, h, data }
}
