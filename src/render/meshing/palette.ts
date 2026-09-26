import { MAX_BLOCK_ID, type BlockRegistry } from '../../core/blocks/registry';

/** Per-block rendering data derived from the registry, in flat arrays for the mesher. */
export interface Palette {
  /** Linear RGB base color per block id, 3 floats each. */
  readonly linear: Float32Array;
  /** Color variation amplitude per block id (RENDER-001.b). */
  readonly variation: Float32Array;
  /** 1 if the block hides adjacent faces. */
  readonly opaque: Uint8Array;
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function createPalette(registry: BlockRegistry): Palette {
  const linear = new Float32Array((MAX_BLOCK_ID + 1) * 3);
  const variation = new Float32Array(MAX_BLOCK_ID + 1);
  for (const block of registry.all()) {
    linear[block.id * 3] = srgbToLinear(((block.color >> 16) & 0xff) / 255);
    linear[block.id * 3 + 1] = srgbToLinear(((block.color >> 8) & 0xff) / 255);
    linear[block.id * 3 + 2] = srgbToLinear((block.color & 0xff) / 255);
    variation[block.id] = block.variation;
  }
  return { linear, variation, opaque: registry.opaque };
}
