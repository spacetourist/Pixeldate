// Walk-cycle previews from src/world/walk.ts (the pixel-exact kit_dir.py port):
//   shots/walk-board.png   12 samples x (down, up, left, right) x (stand, 1..4), integer x4
//   shots/walk-preview.gif all 12 walking in each direction, 160 ms frames, feet on a shared baseline
// Node writes raw RGBA; Pillow (python3) does the PNG/GIF encoding.   Run: node tools/walk-board.mjs
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { composeDir, DIRS, WALK_W, WALK_H, WALK_FRAME_MS } from '../src/world/walk.ts'
import { SAMPLES } from '../src/avatar/kit/kit.gen.ts'
const frames = ['stand', 0, 1, 2, 3], raw = []
for (const s of SAMPLES) for (const d of DIRS) for (const f of frames) raw.push(Buffer.from(composeDir(s, d, f).buffer))
writeFileSync('/tmp/walk-raw.bin', Buffer.concat(raw))
execFileSync('python3', ['-c', `
from PIL import Image
W,H,S,D,F,K=${WALK_W},${WALK_H},${SAMPLES.length},4,5,4
raw=open('/tmp/walk-raw.bin','rb').read(); n=W*H*4
cell=lambda i: Image.frombytes('RGBA',(W,H),raw[i*n:(i+1)*n])
BG=(16,11,36,255); pad=4
board=Image.new('RGBA',(pad+D*F*(W+2)+D*4+pad, pad+S*(H+2)+pad),BG)
for s in range(S):
  for d in range(D):
    for f in range(F):
      board.alpha_composite(cell((s*D+d)*F+f),(pad+(d*F+f)*(W+2)+(d*4), pad+s*(H+2)))
board=board.resize((board.width*K,board.height*K),Image.NEAREST); board.save('shots/walk-board.png')
gk=3; frames=[]
for d in range(D):
  for rep in range(2):
    for f in range(1,5):
      im=Image.new('RGBA',(S*(W+4)*gk,(H+4)*gk),BG)
      for s in range(S): im.alpha_composite(cell((s*D+d)*F+f).resize((W*gk,H*gk),Image.NEAREST),((s*(W+4)+2)*gk,2*gk))
      frames.append(im.convert('RGB'))
frames[0].save('shots/walk-preview.gif',save_all=True,append_images=frames[1:],duration=${WALK_FRAME_MS},loop=0,disposal=1)
print(board.size, len(frames))
`], { stdio: 'inherit' })
