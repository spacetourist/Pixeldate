/* The slice of PixiJS v8 the café uses: a renderer, containers and sprites. Imported by module path (alias `pixi-lib`,
   see vite.config.ts + tsconfig paths) so the package root's side-effect imports stay out of the world chunk.
   The renderer itself (WebGL; WebGPU / Canvas only as fallbacks) is a further lazy chunk that Pixi loads on init. */
export { autoDetectRenderer } from 'pixi-lib/rendering/renderers/autoDetectRenderer'
export { Container } from 'pixi-lib/scene/container/Container'
export { Sprite } from 'pixi-lib/scene/sprite/Sprite'
export { Texture } from 'pixi-lib/rendering/renderers/shared/texture/Texture'
export { CanvasSource } from 'pixi-lib/rendering/renderers/shared/texture/sources/CanvasSource'
export { Rectangle } from 'pixi-lib/maths/shapes/Rectangle'
export type { Renderer as PixiRenderer } from 'pixi-lib/rendering/renderers/types'
