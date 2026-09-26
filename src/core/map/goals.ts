import { areaBounds, areaContains } from '../compose/areas';
import type { Region } from '../nav/pathfinding';
import type { Goal } from './worldMap';

/** The columns an arrival goal leads to, as a region for the path search (plan F06 P10). */
export function regionOf(goal: Extract<Goal, { kind: 'columns' | 'area' }>): Region {
  if (goal.kind === 'area') {
    const box = areaBounds(goal.area);
    const extra = goal.area.kind === 'circle' ? 1 : 0;
    return {
      bounds: { minX: box.minX, minZ: box.minZ, maxX: box.maxX + extra, maxZ: box.maxZ + extra },
      has: (x, z) => areaContains(goal.area, x, z),
      reach: 'within',
    };
  }
  const keys = new Set(goal.columns.map(([x, z]) => `${x},${z}`));
  const xs = goal.columns.map(([x]) => x);
  const zs = goal.columns.map(([, z]) => z);
  return {
    bounds: {
      minX: Math.min(...xs),
      minZ: Math.min(...zs),
      maxX: Math.max(...xs) + 1,
      maxZ: Math.max(...zs) + 1,
    },
    has: (x, z) => keys.has(`${x},${z}`),
    reach: 'touch',
  };
}
