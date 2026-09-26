import { COBBLESTONE, defineStructure, int, object, randomInt, ROOF_TILES } from 'yw3d';

/** A small stone tower with a red cap: a structure of the author, outside the yw3d sources. */
export default defineStructure({
  name: 'tower',
  params: object({ height: int({ min: 6, max: 20, default: 12 }) }),
  terrain: 'sit',
  footprint: () => ({ minX: -2, minZ: -2, maxX: 2, maxZ: 2 }),
  generate({ params, random, builder }) {
    const top = params.height + randomInt(random, 0, 2);
    builder.fill(-2, 0, -2, 2, top, 2, COBBLESTONE);
    builder.fill(-2, top, -2, 2, top + 1, 2, ROOF_TILES);
  },
});
